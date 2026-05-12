'use strict';

(function () {

    function readForumAttribute(name) {
        try {
            var resources = (app.data && app.data.resources) || [];
            for (var i = 0; i < resources.length; i++) {
                var r = resources[i];
                if (r && r.type === 'forums' && r.attributes && name in r.attributes) {
                    return r.attributes[name];
                }
            }
        } catch (e) {}
        return null;
    }

    function tagSlugs() {
        var raw = readForumAttribute('linkrobinsBlogTagSlugs');

        if (!raw || typeof raw !== 'string' || raw.trim() === '') {
            raw = readForumAttribute('linkrobinsBlogTagSlug');
        }
        if (!raw || typeof raw !== 'string') return ['blog'];
        var parts = raw.split(/[\r\n,]+/);
        var out = [];
        for (var i = 0; i < parts.length; i++) {
            var p = String(parts[i]).trim().toLowerCase();
            if (p) out.push(p);
        }
        if (out.length === 0) return ['blog'];

        var seen = {};
        var unique = [];
        for (var j = 0; j < out.length; j++) {
            if (!seen[out[j]]) { seen[out[j]] = true; unique.push(out[j]); }
        }
        return unique;
    }

    function isBlogTag(slug) {
        if (!slug) return false;
        var lower = String(slug).toLowerCase();
        var slugs = tagSlugs();
        for (var i = 0; i < slugs.length; i++) {
            if (slugs[i] === lower) return true;
        }
        return false;
    }

    function navLabel() {
        var v = readForumAttribute('linkrobinsBlogNavLabel');
        if (typeof v === 'string' && v.trim() !== '') return v.trim();
        return app.translator.trans('linkrobins-blog.forum.nav.blog_link');
    }

    function navIcon() {
        var v = readForumAttribute('linkrobinsBlogNavIcon');
        if (typeof v === 'string' && v.trim() !== '') return v.trim();
        return 'fas fa-feather-alt';
    }

    function isBlogHomepage() {
        return readForumAttribute('defaultRoute') === '/blog';
    }

    function siteTitle() {
        var t = readForumAttribute('linkrobinsBlogTitle');
        if (t) return t;
        return (app.forum && app.forum.attribute('title')) || 'Blog';
    }

    function siteTagline() {
        return readForumAttribute('linkrobinsBlogTagline') || '';
    }

    function showFeatured() {
        var v = readForumAttribute('linkrobinsBlogShowFeatured');
        return v !== false;
    }

    function applyBlogBodyClass(on) {
        var el = document.documentElement;
        if (!el) return;
        if (on) el.classList.add('LinkRobinsBlogActive');
        else    el.classList.remove('LinkRobinsBlogActive');
    }

    function formatDate(date) {
        if (!date) return '';
        try {
            return date.toLocaleDateString(undefined, {
                year:  'numeric',
                month: 'long',
                day:   'numeric',
            });
        } catch (e) {
            return '';
        }
    }

    function stripCoverImageFromBody(html, coverUrl) {
        if (!html || !coverUrl) return html;
        if (typeof DOMParser === 'undefined') return html;

        try {

            var doc = new DOMParser().parseFromString(
                '<div id="lr-blog-root">' + html + '</div>',
                'text/html'
            );
            var root = doc.getElementById('lr-blog-root');
            if (!root) return html;

            var firstP = root.querySelector('p');
            if (!firstP) return html;

            var refsCover = false;
            var imgs = firstP.querySelectorAll('img');
            for (var i = 0; i < imgs.length; i++) {
                if (imgs[i].getAttribute('src') === coverUrl) { refsCover = true; break; }
            }
            if (!refsCover) {
                var anchors = firstP.querySelectorAll('a');
                for (var j = 0; j < anchors.length; j++) {
                    if (anchors[j].getAttribute('href') === coverUrl) { refsCover = true; break; }
                }
            }
            if (!refsCover) return html;

            var clone = firstP.cloneNode(true);
            var stripImgs = clone.querySelectorAll('img');
            for (var k = 0; k < stripImgs.length; k++) {
                stripImgs[k].parentNode.removeChild(stripImgs[k]);
            }

            var leftoverAnchors = clone.querySelectorAll('a');
            for (var n = 0; n < leftoverAnchors.length; n++) {
                if (!(leftoverAnchors[n].textContent || '').trim()) {
                    leftoverAnchors[n].parentNode.removeChild(leftoverAnchors[n]);
                }
            }
            var remaining = (clone.textContent || '').trim();
            if (remaining !== '') return html;

            firstP.parentNode.removeChild(firstP);
            return root.innerHTML;
        } catch (e) {
            console.warn('[linkrobins/blog] cover-strip failed, leaving body intact:', e);
            return html;
        }
    }

    function discussionPath(d) {
        var id = d.id();
        var slug = (d.slug && d.slug()) || '';
        return '/blog/' + id + (slug ? '-' + slug : '');
    }

    function renderTopNav(activePath) {
        var basePath = (app.forum && app.forum.attribute('basePath')) || '';
        var blogHome = isBlogHomepage();

        var forumEntry = {
            href:   blogHome ? (basePath + '/all') : (basePath + '/'),
            icon:   'far fa-comments',
            label:  app.translator.trans('linkrobins-blog.forum.nav.forum_link'),
            active: activePath === '/all' || (!blogHome && activePath === '/'),
        };

        var blogEntry = {
            href:   blogHome ? (basePath + '/') : (basePath + '/blog'),
            icon:   navIcon(),
            label:  navLabel(),
            active: activePath === '/blog' || (blogHome && activePath === '/'),
        };

        var entries = blogHome ? [blogEntry, forumEntry] : [forumEntry, blogEntry];

        return m('nav', { className: 'LinkRobinsBlog-topNav' },
            entries.map(function (e) {
                return m('a', {
                    href:      e.href,
                    className: 'LinkRobinsBlog-topNav-link' + (e.active ? ' is-active' : ''),
                    onclick:   function (ev) {
                        if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.button === 1) return;
                        ev.preventDefault();
                        m.route.set(e.href.slice(basePath.length) || '/');
                    },
                    key: 'nav-' + e.href,
                }, [
                    m('i', { className: e.icon + ' icon' }),
                    ' ',
                    m('span', null, e.label),
                ]);
            })
        );
    }

    function makeBlogIndexPage(Page) {
        return class BlogIndexPage extends Page {
            oninit(vnode) {
                super.oninit(vnode);
                this.loading      = true;
                this.loadingMore  = false;
                this.error        = null;
                this.discussions  = [];
                this.offset       = 0;
                this.hasMore      = true;

                try {
                    app.setTitle('');
                    app.setTitleCount(0);
                } catch (e) {}

                this._load();
            }

            oncreate(vnode) {
                super.oncreate(vnode);
                applyBlogBodyClass(true);
                this._installScrollObserver();
            }

            onupdate(vnode) {
                if (super.onupdate) super.onupdate(vnode);

                this._installScrollObserver();
            }

            onremove(vnode) {
                applyBlogBodyClass(false);
                this._teardownScrollObserver();
                if (super.onremove) super.onremove(vnode);
            }

            _load() {
                var self = this;
                var limit = showFeatured() ? 13 : 12;

                var params = {
                    filter:  { tag: tagSlugs().join(',') },
                    sort:    '-createdAt',
                    page:    { limit: limit, offset: 0 },
                    include: 'firstPost,user,tags',
                };

                app.store.find('discussions', params)
                    .then(function (results) {
                        self.discussions = (results || []).slice();
                        self.offset      = self.discussions.length;
                        self.hasMore     = !!(results && results.payload && results.payload.links && results.payload.links.next);
                        self.loading     = false;
                        if (!results || results.length === 0) {
                            console.warn(
                                '[linkrobins/blog] No discussions found for tag filter: ' +
                                params.filter.tag +
                                ' — check that these tag slugs exist on your forum ' +
                                '(Admin → Tags → look at each tag\'s slug column).'
                            );
                        }
                        m.redraw();
                    })
                    .catch(function (err) {
                        self.error = err;
                        self.loading = false;
                        console.error('[linkrobins/blog] failed to load discussions:', err);
                        m.redraw();
                    });
            }

            _loadMore() {
                if (this.loading || this.loadingMore || !this.hasMore) return;
                var self = this;
                self.loadingMore = true;
                m.redraw();

                var params = {
                    filter:  { tag: tagSlugs().join(',') },
                    sort:    '-createdAt',
                    page:    { limit: 12, offset: this.offset },
                    include: 'firstPost,user,tags',
                };

                app.store.find('discussions', params)
                    .then(function (results) {
                        var fresh = (results || []).slice();

                        var existing = {};
                        self.discussions.forEach(function (d) { existing[d.id()] = true; });
                        fresh.forEach(function (d) {
                            if (!existing[d.id()]) self.discussions.push(d);
                        });
                        self.offset       = self.discussions.length;
                        self.hasMore      = !!(results && results.payload && results.payload.links && results.payload.links.next);
                        self.loadingMore  = false;
                        m.redraw();
                    })
                    .catch(function (err) {
                        self.loadingMore = false;
                        console.error('[linkrobins/blog] failed to load more discussions:', err);
                        m.redraw();
                    });
            }

            _installScrollObserver() {
                if (this._observer) return;
                if (typeof IntersectionObserver === 'undefined') return;
                var sentinel = document.querySelector('.LinkRobinsBlog-loadMore-sentinel');
                if (!sentinel) return;

                var self = this;
                this._observer = new IntersectionObserver(function (entries) {
                    for (var i = 0; i < entries.length; i++) {
                        if (entries[i].isIntersecting) {
                            self._loadMore();
                            break;
                        }
                    }
                }, {

                    rootMargin: '600px 0px',
                });
                this._observer.observe(sentinel);
                this._observedSentinel = sentinel;
            }

            _teardownScrollObserver() {
                if (this._observer) {
                    try { this._observer.disconnect(); } catch (e) {}
                    this._observer = null;
                    this._observedSentinel = null;
                }
            }

            view() {
                if (this.loading) {
                    return m('div', { className: 'LinkRobinsBlog LinkRobinsBlog--loading' },
                        m('div', { className: 'LinkRobinsBlog-loading' }, m('i', { className: 'fas fa-spinner fa-spin' }))
                    );
                }

                if (this.error || !this.discussions.length) {
                    return m('div', { className: 'LinkRobinsBlog LinkRobinsBlog--empty' },
                        this._renderHeader(),
                        m('div', { className: 'LinkRobinsBlog-empty' },
                            app.translator.trans('linkrobins-blog.forum.empty_state'))
                    );
                }

                var featured = showFeatured() ? this.discussions[0] : null;
                var rest = featured ? this.discussions.slice(1) : this.discussions.slice();
                var self = this;

                return m('div', { className: 'LinkRobinsBlog' }, [
                    this._renderHeader(),
                    featured ? this._renderFeatured(featured) : null,
                    m('div', { className: 'LinkRobinsBlog-grid' },
                        rest.map(this._renderCard.bind(this))
                    ),
                    this._renderLoadMore(),
                ]);
            }

            _renderLoadMore() {
                if (!this.hasMore && !this.loadingMore) return null;

                var self = this;
                return m('div', { className: 'LinkRobinsBlog-loadMore' }, [
                    m('div', { className: 'LinkRobinsBlog-loadMore-sentinel' }),
                    this.loadingMore
                        ? m('div', { className: 'LinkRobinsBlog-loadMore-spinner' },
                            m('i', { className: 'fas fa-spinner fa-spin' }))
                        : this.hasMore
                            ? m('button', {
                                type:      'button',
                                className: 'Button LinkRobinsBlog-loadMore-button',
                                onclick:   function () { self._loadMore(); },
                              }, app.translator.trans('linkrobins-blog.forum.load_more'))
                            : null,
                ]);
            }

            _renderHeader() {
                var tagline = siteTagline();
                var currentPath = m.route.get();
                return m('header', { className: 'LinkRobinsBlog-hero' }, [
                    renderTopNav(currentPath),
                    m('div', { className: 'LinkRobinsBlog-hero-inner' }, [
                        this._renderHeroBranding(),
                        tagline ? m('p', { className: 'LinkRobinsBlog-hero-tagline' }, tagline) : null,
                    ]),
                ]);
            }

            _renderHeroBranding() {
                var mode = readForumAttribute('linkrobinsBlogHeaderMode') || 'text';
                var title = siteTitle();
                var basePath = (app.forum && app.forum.attribute('basePath')) || '';
                var heroHref = isBlogHomepage() ? (basePath + '/') : (basePath + '/blog');

                var imgLight = null;
                var imgDark  = null;

                if (mode === 'logo') {
                    imgLight = app.forum && app.forum.attribute('logoUrl');
                    imgDark  = app.forum && app.forum.attribute('logoDarkModeUrl');
                } else if (mode === 'custom') {
                    var custom = readForumAttribute('linkrobinsBlogCustomLogoUrl');
                    if (typeof custom === 'string' && custom.trim() !== '') {
                        imgLight = custom.trim();
                        imgDark  = imgLight;
                    }
                }

                if (imgLight) {
                    var nodes = [
                        m('img', {
                            src:       imgLight,
                            alt:       title,
                            className: 'LinkRobinsBlog-hero-logo' + (imgDark && imgDark !== imgLight ? ' LinkRobinsBlog-hero-logo--light' : ''),
                        }),
                    ];
                    if (imgDark && imgDark !== imgLight) {
                        nodes.push(m('img', {
                            src:       imgDark,
                            alt:       title,
                            className: 'LinkRobinsBlog-hero-logo LinkRobinsBlog-hero-logo--dark',
                        }));
                    }
                    return m('a', {
                        href:    heroHref,
                        className: 'LinkRobinsBlog-hero-brand',
                        onclick: function (e) {
                            if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
                            e.preventDefault();
                            m.route.set(heroHref.slice(basePath.length) || '/');
                        },
                    }, nodes);
                }

                return m('h1', { className: 'LinkRobinsBlog-hero-title' }, title);
            }

            _renderFeatured(discussion) {
                var cover    = discussion.attribute('linkrobinsBlogCoverImage') || null;
                var excerpt  = discussion.attribute('linkrobinsBlogExcerpt') || '';
                var title    = discussion.title();
                var author   = discussion.user();
                var createdAt = discussion.createdAt();
                var tags     = (discussion.tags && discussion.tags()) || [];

                return m('article', {
                    className: 'LinkRobinsBlog-featured',
                    onclick: function () {
                        m.route.set(discussionPath(discussion));
                    },
                }, [
                    cover ? m('div', {
                        className: 'LinkRobinsBlog-featured-cover',
                        style:     'background-image: url(' + JSON.stringify(cover).slice(1, -1) + ');',
                    }) : m('div', { className: 'LinkRobinsBlog-featured-cover LinkRobinsBlog-featured-cover--placeholder' }),
                    m('div', { className: 'LinkRobinsBlog-featured-body' }, [
                        this._renderTagsRow(tags),
                        m('h2', { className: 'LinkRobinsBlog-featured-title' }, title),
                        excerpt ? m('p', { className: 'LinkRobinsBlog-featured-excerpt' }, excerpt) : null,
                        this._renderMeta(author, createdAt),
                    ]),
                ]);
            }

            _renderCard(discussion) {
                var cover    = discussion.attribute('linkrobinsBlogCoverImage') || null;
                var excerpt  = discussion.attribute('linkrobinsBlogExcerpt') || '';
                var title    = discussion.title();
                var author   = discussion.user();
                var createdAt = discussion.createdAt();
                var tags     = (discussion.tags && discussion.tags()) || [];

                return m('article', {
                    className: 'LinkRobinsBlog-card',
                    key:       'd-' + discussion.id(),
                    onclick: function () {
                        m.route.set(discussionPath(discussion));
                    },
                }, [
                    cover
                        ? m('div', {
                            className: 'LinkRobinsBlog-card-cover',
                            style:     'background-image: url(' + JSON.stringify(cover).slice(1, -1) + ');',
                          })
                        : m('div', { className: 'LinkRobinsBlog-card-cover LinkRobinsBlog-card-cover--placeholder' }),
                    m('div', { className: 'LinkRobinsBlog-card-body' }, [
                        this._renderTagsRow(tags),
                        m('h3', { className: 'LinkRobinsBlog-card-title' }, title),
                        excerpt ? m('p', { className: 'LinkRobinsBlog-card-excerpt' }, excerpt) : null,
                        this._renderMeta(author, createdAt),
                    ]),
                ]);
            }

            _renderTagsRow(tags) {
                if (!tags || tags.length === 0) return null;

                var blogMatches = tags.filter(function (t) {
                    return t && t.slug && isBlogTag(t.slug());
                });
                var display = blogMatches.length > 0
                    ? blogMatches
                    : tags.filter(function (t) { return t && t.slug; });
                if (display.length === 0) return null;
                return m('div', { className: 'LinkRobinsBlog-tags' },
                    display.slice(0, 2).map(function (t) {
                        var color = (t.color && t.color()) || 'var(--primary-color)';
                        var slug  = t.slug();
                        var href  = app.route('tag', { tags: slug });
                        return m('a', {
                            href:      href,
                            className: 'LinkRobinsBlog-tag',
                            style:     'color: ' + color + ';',
                            key:       't-' + t.id(),
                            onclick:   function (e) {

                                e.stopPropagation();
                            },
                        }, t.name());
                    })
                );
            }

            _renderMeta(author, createdAt) {
                var children = [];
                if (author) {
                    var avatar = (author.avatarUrl && author.avatarUrl()) || null;
                    children.push(m('span', { className: 'LinkRobinsBlog-meta-author' }, [
                        avatar
                            ? m('img', { className: 'LinkRobinsBlog-meta-avatar', src: avatar, alt: '' })
                            : m('span', { className: 'LinkRobinsBlog-meta-avatar LinkRobinsBlog-meta-avatar--placeholder' }),
                        m('span', { className: 'LinkRobinsBlog-meta-name' }, author.displayName()),
                    ]));
                }
                if (createdAt) {
                    children.push(m('span', { className: 'LinkRobinsBlog-meta-date' }, formatDate(createdAt)));
                }
                if (children.length === 0) return null;
                return m('div', { className: 'LinkRobinsBlog-meta' }, children);
            }
        };
    }

    function makeBlogPostPage(Page, CommentPost, DiscussionControls) {
        return class BlogPostPage extends Page {
            oninit(vnode) {
                super.oninit(vnode);
                this.loading    = true;
                this.error      = null;
                this.discussion = null;
                this.posts      = [];
                this._load();
            }

            oncreate(vnode) {
                super.oncreate(vnode);
                applyBlogBodyClass(true);

                var self = this;

                this._pollTimer = setInterval(function () {
                    if (document.hidden) return;
                    self._refreshComments();
                }, 8000);

                this._onFocus = function () { self._refreshComments(); };
                window.addEventListener('focus', this._onFocus);

                this._wsHandler = function (data) {
                    try {
                        var discussion = app.store.pushPayload(data);
                        if (discussion && discussion.id && self.discussion &&
                            String(discussion.id()) === String(self.discussion.id())) {
                            self._refreshComments();
                        }
                    } catch (e) {}
                };
                try {
                    var channels = (app.websocket_channels) || {};
                    if (channels.public && typeof channels.public.bind === 'function') {
                        channels.public.bind('Flarum\\Post\\Event\\Posted', this._wsHandler);
                    }
                    if (channels.user && typeof channels.user.bind === 'function') {
                        channels.user.bind('Flarum\\Post\\Event\\Posted', this._wsHandler);
                    }
                } catch (e) {

                }
            }

            onremove(vnode) {
                applyBlogBodyClass(false);
                if (this._pollTimer) {
                    clearInterval(this._pollTimer);
                    this._pollTimer = null;
                }
                if (this._onFocus) {
                    window.removeEventListener('focus', this._onFocus);
                    this._onFocus = null;
                }

                try {
                    var channels = (app.websocket_channels) || {};
                    if (this._wsHandler && channels.public && typeof channels.public.unbind === 'function') {
                        channels.public.unbind('Flarum\\Post\\Event\\Posted', this._wsHandler);
                    }
                    if (this._wsHandler && channels.user && typeof channels.user.unbind === 'function') {
                        channels.user.unbind('Flarum\\Post\\Event\\Posted', this._wsHandler);
                    }
                } catch (e) {}
                this._wsHandler = null;
                if (super.onremove) super.onremove(vnode);
            }

            _refreshComments() {
                var self = this;
                if (!this.discussion || this.loading) return;
                var id = this.discussion.id();
                app.store.find('posts', {
                    filter:  { discussion: id, type: 'comment' },
                    sort:    'number',
                    page:    { limit: 50 },
                    include: 'user',
                }).then(function (posts) {
                    var fresh = (posts || []).filter(function (p) { return p; });

                    if (fresh.length !== self.posts.length) {
                        self.posts = fresh;
                        m.redraw();
                    }
                }).catch(function () {  });
            }

            _load() {
                var self = this;
                var idParam = m.route.param('id') || '';

                var idMatch = idParam.match(/^(\d+)/);
                if (!idMatch) {
                    self.error = new Error('No id in route');
                    self.loading = false;
                    return;
                }
                var id = idMatch[1];

                app.store.find('discussions', id, {
                    include: 'tags',
                })
                    .then(function (discussion) {
                        self.discussion = discussion;

                        if (typeof discussion.attribute('linkrobinsBlogExcerpt') === 'undefined') {
                            console.warn(
                                '[linkrobins/blog] linkrobinsBlogExcerpt attribute is undefined on ' +
                                'this discussion. The Extend\\ApiResource fields() extender did not ' +
                                'land — try `php flarum cache:clear` on the server.'
                            );
                        }

                        return app.store.find('posts', {
                            filter:  { discussion: id, type: 'comment' },
                            sort:    'number',
                            page:    { limit: 50 },
                            include: 'user',
                        });
                    })
                    .then(function (posts) {
                        self.posts = (posts || []).filter(function (p) { return p; });
                        self.loading = false;
                        m.redraw();
                    })
                    .catch(function (err) {
                        self.error = err;
                        self.loading = false;
                        console.error('[linkrobins/blog] failed to load discussion:', err);
                        m.redraw();
                    });
            }

            view() {
                if (this.loading) {
                    return m('div', { className: 'LinkRobinsBlog LinkRobinsBlog--loading' },
                        m('div', { className: 'LinkRobinsBlog-loading' }, m('i', { className: 'fas fa-spinner fa-spin' }))
                    );
                }
                if (this.error || !this.discussion) {
                    return m('div', { className: 'LinkRobinsBlog' },
                        m('div', { className: 'LinkRobinsBlog-empty' },
                            app.translator.trans('linkrobins-blog.forum.not_found'))
                    );
                }

                var d = this.discussion;
                var firstPost = d.firstPost && d.firstPost();
                var comments  = this.posts.filter(function (p) {
                    if (!p || !p.contentType) return false;
                    if (firstPost && p.id() === firstPost.id()) return false;
                    return p.contentType() === 'comment';
                });

                var cover = d.attribute('linkrobinsBlogCoverImage') || null;
                var tags  = (d.tags && d.tags()) || [];

                return m('div', { className: 'LinkRobinsBlog LinkRobinsBlog--post' }, [
                    renderTopNav('/blog'),
                    m('article', { className: 'LinkRobinsBlog-post' }, [
                        cover ? m('div', {
                            className: 'LinkRobinsBlog-post-cover',
                            style:     'background-image: url(' + JSON.stringify(cover).slice(1, -1) + ');',
                        }) : null,

                        m('header', { className: 'LinkRobinsBlog-post-header' }, [
                            this._renderTagsRow(tags),
                            m('h1', { className: 'LinkRobinsBlog-post-title' }, d.title()),
                            this._renderMeta(d.user(), d.createdAt()),
                            this._renderActions(d, firstPost),
                        ]),

                        firstPost
                            ? m('div', {
                                className: 'LinkRobinsBlog-post-body Post-body',
                              }, m.trust(
                                cover
                                    ? stripCoverImageFromBody(firstPost.contentHtml() || '', cover)
                                    : (firstPost.contentHtml() || '')
                              ))
                            : null,
                    ]),

                    m('section', { className: 'LinkRobinsBlog-comments' }, [
                        m('h2', { className: 'LinkRobinsBlog-comments-title' },
                            comments.length > 0
                                ? app.translator.trans('linkrobins-blog.forum.comments_heading', { count: comments.length })
                                : app.translator.trans('linkrobins-blog.forum.no_comments_heading')),

                        comments.length > 0
                            ? m('div', { className: 'LinkRobinsBlog-comments-list' },
                                comments.map(function (post) {
                                    return CommentPost
                                        ? m(CommentPost, { post: post, key: 'p-' + post.id() })
                                        : null;
                                }))
                            : m('p', { className: 'LinkRobinsBlog-comments-empty' },
                                app.translator.trans('linkrobins-blog.forum.no_comments')),

                        app.session && app.session.user && DiscussionControls
                            ? m('button', {
                                type:      'button',
                                className: 'Button LinkRobinsBlog-replyButton',
                                onclick:   (function (pageInstance) {
                                    return function () {
                                        try {
                                            DiscussionControls.replyAction.call(d, true, false).catch(function () {});

                                            var tries = 0;
                                            var poller = setInterval(function () {
                                                tries++;
                                                if (tries > 30 || document.hidden) {
                                                    if (tries > 30) clearInterval(poller);
                                                    return;
                                                }
                                                pageInstance._refreshComments();
                                            }, 2000);
                                        } catch (err) {
                                            console.error('[linkrobins/blog] failed to open composer:', err);
                                        }
                                    };
                                })(this),
                              }, [
                                m('i', { className: 'icon fas fa-reply' }),
                                ' ',
                                app.translator.trans('linkrobins-blog.forum.leave_comment'),
                              ])
                            : (!app.session || !app.session.user)
                                ? m('div', { className: 'LinkRobinsBlog-loginPrompt' }, [
                                    m('a', {
                                        href:    '#',
                                        onclick: function (e) {
                                            e.preventDefault();

                                            try {
                                                var headerButtons = document.querySelectorAll('#header-secondary .Button--link');
                                                var loginText = String(app.translator.trans('core.forum.header.log_in_link') || 'Log In').toLowerCase();
                                                for (var i = 0; i < headerButtons.length; i++) {
                                                    var btn = headerButtons[i];
                                                    var text = (btn.textContent || '').trim().toLowerCase();
                                                    if (text === loginText || text.indexOf('log in') !== -1) {
                                                        btn.click();
                                                        return;
                                                    }
                                                }
                                                console.warn('[linkrobins/blog] could not find header Log In button to open the modal');
                                            } catch (err) {
                                                console.error('[linkrobins/blog] could not open login modal:', err);
                                            }
                                        },
                                    }, app.translator.trans('linkrobins-blog.forum.login_to_comment')),
                                  ])
                                : null,
                    ]),
                ]);
            }

            _renderTagsRow(tags) {
                if (!tags || tags.length === 0) return null;

                var blogMatches = [];
                var others      = [];
                tags.forEach(function (t) {
                    if (!t || !t.slug) return;
                    if (isBlogTag(t.slug())) blogMatches.push(t);
                    else                     others.push(t);
                });
                var ordered = blogMatches.concat(others);
                if (ordered.length === 0) return null;
                return m('div', { className: 'LinkRobinsBlog-tags' },
                    ordered.map(function (t) {
                        var color = (t.color && t.color()) || 'var(--primary-color)';
                        var slug  = t.slug();
                        var href  = app.route('tag', { tags: slug });
                        return m('a', {
                            href:      href,
                            className: 'LinkRobinsBlog-tag',
                            style:     'color: ' + color + ';',
                            key:       't-' + t.id(),
                        }, t.name());
                    })
                );
            }

            _renderMeta(author, createdAt) {
                var children = [];
                if (author) {
                    var avatar = (author.avatarUrl && author.avatarUrl()) || null;
                    children.push(m('span', { className: 'LinkRobinsBlog-meta-author' }, [
                        avatar
                            ? m('img', { className: 'LinkRobinsBlog-meta-avatar', src: avatar, alt: '' })
                            : m('span', { className: 'LinkRobinsBlog-meta-avatar LinkRobinsBlog-meta-avatar--placeholder' }),
                        m('span', { className: 'LinkRobinsBlog-meta-name' }, author.displayName()),
                    ]));
                }
                if (createdAt) {
                    children.push(m('span', { className: 'LinkRobinsBlog-meta-date' }, formatDate(createdAt)));
                }
                if (children.length === 0) return null;
                return m('div', { className: 'LinkRobinsBlog-meta' }, children);
            }

            _renderActions(discussion, firstPost) {
                var Dropdown       = null;
                var PostControls   = null;
                var DiscControls   = null;
                try { Dropdown     = flarum.reg.get('core', 'common/components/Dropdown'); }       catch (e) {}
                try { PostControls = flarum.reg.get('core', 'forum/utils/PostControls'); }         catch (e) {}
                try { DiscControls = flarum.reg.get('core', 'forum/utils/DiscussionControls'); }   catch (e) {}

                if (!Dropdown) return null;

                var items = [];
                try {
                    if (firstPost && PostControls && typeof PostControls.moderationControls === 'function') {
                        var postItems = PostControls.moderationControls(firstPost, this).toArray();
                        for (var i = 0; i < postItems.length; i++) items.push(postItems[i]);
                    }
                } catch (e) {}
                try {
                    if (discussion && DiscControls && typeof DiscControls.controls === 'function') {
                        var dItems = DiscControls.controls(discussion, this).toArray();
                        for (var j = 0; j < dItems.length; j++) items.push(dItems[j]);
                    }
                } catch (e) {}

                items = items.filter(function (it) { return it != null; });
                if (items.length === 0) return null;

                return m('div', { className: 'LinkRobinsBlog-actions' },
                    m(Dropdown, {
                        className:       'LinkRobinsBlog-actions-dropdown',
                        buttonClassName: 'Button Button--icon Button--flat',
                        menuClassName:   'Dropdown-menu--right',
                        icon:            'fas fa-ellipsis-h',
                        accessibleToggleLabel: app.translator.trans('linkrobins-blog.forum.actions_label'),
                    }, items)
                );
            }
        };
    }

    app.initializers.add('linkrobins/blog', function () {
        try {

            var Page               = null;
            var CommentPost        = null;
            var DiscussionControls = null;

            try { Page               = flarum.reg.get('core', 'common/components/Page'); }            catch (e) {}
            try { CommentPost        = flarum.reg.get('core', 'forum/components/CommentPost'); }      catch (e) {}
            try { DiscussionControls = flarum.reg.get('core', 'forum/utils/DiscussionControls'); }    catch (e) {}

            if (!Page) {
                console.error('[linkrobins/blog] common/components/Page not available');
                return;
            }

            var BlogIndexPage = makeBlogIndexPage(Page);
            var BlogPostPage  = makeBlogPostPage(Page, CommentPost, DiscussionControls);

            app.routes['linkrobins-blog.index'] = {
                path:      '/blog',
                component: BlogIndexPage,
            };
            app.routes['linkrobins-blog.post'] = {
                path:      '/blog/:id',
                component: BlogPostPage,
            };

            try {
                var IndexSidebar = flarum.reg.get('core', 'forum/components/IndexSidebar');
                var LinkButton   = flarum.reg.get('core', 'common/components/LinkButton');
                var extMod       = flarum.reg.get('core', 'common/extend');
                var extend       = extMod && extMod.extend;

                if (IndexSidebar && LinkButton && typeof extend === 'function') {
                    extend(IndexSidebar.prototype, 'navItems', function (items) {
                        var basePath = (app.forum && app.forum.attribute('basePath')) || '';

                        var priority = isBlogHomepage() ? 110 : 50;
                        var href     = isBlogHomepage() ? (basePath + '/') : (basePath + '/blog');

                        items.add(
                            'linkrobins-blog',
                            m(LinkButton, {
                                href: href,
                                icon: navIcon(),
                            }, navLabel()),
                            priority
                        );
                    });
                }
            } catch (e) {
                console.error('[linkrobins/blog] could not extend IndexSidebar nav:', e);
            }
        } catch (e) {
            console.error('[linkrobins/blog] init failed:', e);
        }
    });

})();

module.exports = {};
