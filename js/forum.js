'use strict';

(function () {

    function readForumAttribute(key) {
        try {
            var fa = app.data && app.data.resources;
            if (Array.isArray(fa)) {
                for (var i = 0; i < fa.length; i++) {
                    if (fa[i] && fa[i].type === 'forums' && fa[i].attributes && key in fa[i].attributes) {
                        return fa[i].attributes[key];
                    }
                }
            }
        } catch (e) {}
        try {
            if (app.forum && typeof app.forum.attribute === 'function') {
                return app.forum.attribute(key);
            }
        } catch (e) {}
        return null;
    }

    function siteTitle() {
        var t = readForumAttribute('linkrobinsBlogTitle');
        if (typeof t === 'string' && t.trim() !== '') return t.trim();
        return readForumAttribute('title') || 'Blog';
    }

    function siteTagline() {
        var t = readForumAttribute('linkrobinsBlogTagline');
        if (typeof t === 'string' && t.trim() !== '') return t.trim();
        return '';
    }

    function postsPerPage() {
        var p = parseInt(readForumAttribute('linkrobinsBlogPostsPerPage'), 10);
        if (!isNaN(p) && p > 0 && p <= 50) return p;
        return 12;
    }

    function navLabel() {
        var v = readForumAttribute('linkrobinsBlogNavLabel');
        if (typeof v === 'string' && v.trim() !== '') return v.trim();
        return 'Blog';
    }

    function navIcon() {
        var v = readForumAttribute('linkrobinsBlogNavIcon');
        if (typeof v === 'string' && v.trim() !== '') return v.trim();
        return 'fas fa-feather-alt';
    }

    var BLOG_SLUG    = 'blog';
    var ARTICLE_SLUG = 'article';

    function blogIndexRoute() {
        return '/' + BLOG_SLUG;
    }

    function isBlogHomepage() {
        var def = readForumAttribute('defaultRoute');
        return def === blogIndexRoute();
    }

    // Build a dated URL slug: "2026-05-13-my-post-title".
    function datedSlugFor(post) {
        var attr    = (post && post.attributes) || {};
        var bareSlug = attr.slug || (post && post.id) || '';
        var iso      = attr.publishedAt || attr.createdAt || null;
        if (!iso) return bareSlug;
        try {
            var d = new Date(iso);
            if (isNaN(d.getTime())) return bareSlug;
            var y  = d.getUTCFullYear();
            var mo = ('0' + (d.getUTCMonth() + 1)).slice(-2);
            var dy = ('0' + d.getUTCDate()).slice(-2);
            return y + '-' + mo + '-' + dy + '-' + bareSlug;
        } catch (e) { return bareSlug; }
    }

    // Strip an optional leading "YYYY-MM-DD-" prefix from a URL segment.
    function stripDatePrefix(s) {
        if (typeof s !== 'string') return s;
        return s.replace(/^\d{4}-\d{2}-\d{2}-/, '');
    }

    function applyBlogBodyClass(on) {
        try {
            var el = document.documentElement;
            if (!el) return;
            if (on) el.classList.add('LinkRobinsBlogActive');
            else    el.classList.remove('LinkRobinsBlogActive');
        } catch (e) {}
    }

    function basePath() {
        try {
            return (app.forum && app.forum.attribute && app.forum.attribute('basePath')) || '';
        } catch (e) { return ''; }
    }

    function safeNavigate(href, ev) {
        if (ev && (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.button === 1)) return;

        // Refuse to route anything that isn't an in-app path. We expect href
        // to be either:
        //   - basePath + "/something" (the usual case from our own builders)
        //   - "/something" (already a bare path)
        // If a caller ever passes "https://evil.example/x" or a "javascript:"
        // URL by mistake, slicing basePath off it would produce a garbage
        // string that m.route.set might still navigate to. Bail out instead.
        if (typeof href !== 'string' || href === '') return;

        var base = basePath();
        var path;
        if (base && href.indexOf(base) === 0) {
            path = href.slice(base.length) || '/';
        } else if (href.charAt(0) === '/') {
            path = href;
        } else {
            // Not an internal path — let the browser handle it as a normal
            // <a href> click (we deliberately don't preventDefault).
            return;
        }

        // Reject anything that doesn't look like a clean root-relative path
        // (paranoia: "//evil.example/..." is a scheme-relative URL the
        // browser would happily navigate to).
        if (path.charAt(0) !== '/' || path.charAt(1) === '/') return;

        if (ev) ev.preventDefault();
        m.route.set(path);
    }

    function formatDate(iso) {
        if (!iso) return '';
        try {
            var d = new Date(iso);
            if (isNaN(d.getTime())) return '';
            return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
        } catch (e) { return ''; }
    }

    function postPath(post) {
        return '/' + ARTICLE_SLUG + '/' + datedSlugFor(post);
    }

    function userPath(user) {
        if (!user || !user.attributes) return null;
        var name = user.attributes.slug || user.attributes.username;
        if (!name) return null;
        return '/u/' + encodeURIComponent(name);
    }

    function categoryPath(category) {
        var slug = (category && category.attributes && category.attributes.slug) || (category && category.id);
        return '/category/' + slug;
    }

    var _allCategoriesCache = null;
    var _allCategoriesPromise = null;
    function loadAllCategories(force) {
        if (force) { _allCategoriesCache = null; _allCategoriesPromise = null; }
        if (_allCategoriesCache) return Promise.resolve(_allCategoriesCache);
        if (_allCategoriesPromise) return _allCategoriesPromise;
        _allCategoriesPromise = app.request({
            method: 'GET',
            url:    app.forum.attribute('apiUrl') + '/linkrobins-blog-categories',
            params: { sort: 'position', page: { limit: 100 } },
        }).then(function (resp) {
            _allCategoriesCache = (resp && resp.data) || [];
            return _allCategoriesCache;
        }).catch(function (err) {
            console.error('[linkrobins/blog] could not load categories:', err);
            _allCategoriesPromise = null;
            return [];
        });
        return _allCategoriesPromise;
    }

    // Sidebar blocks system. Other extensions can call window.LinkRobinsBlogAddBlock(id, factory, priority)
    // to register additional blocks. factory(ctx) returns a Mithril vnode or null.
    // ctx provides { isPostPage, post } so blocks can vary by context.
    var _blogBlocks = [];

    function registerBlogBlock(id, factory, priority) {
        if (typeof id !== 'string' || typeof factory !== 'function') return;
        for (var i = 0; i < _blogBlocks.length; i++) {
            if (_blogBlocks[i].id === id) { _blogBlocks.splice(i, 1); break; }
        }
        _blogBlocks.push({ id: id, factory: factory, priority: typeof priority === 'number' ? priority : 0 });
    }

    function renderBlogBlocks(ctx, modifierClass) {
        var sorted = _blogBlocks.slice().sort(function (a, b) { return b.priority - a.priority; });
        var rendered = [];
        for (var i = 0; i < sorted.length; i++) {
            try {
                var out = sorted[i].factory(ctx || {});
                if (out) rendered.push(out);
            } catch (e) {
                console.error('[linkrobins/blog] block failed:', sorted[i].id, e);
            }
        }
        if (!rendered.length) return null;
        return m('div', {
            className: 'LinkRobinsBlog-blocks ' + (modifierClass || ''),
        }, rendered);
    }

    // Built-in HTML widget block (driven by admin settings).
    registerBlogBlock('html', function () {
        var title = readForumAttribute('linkrobinsBlogAboutTitle');
        var html  = readForumAttribute('linkrobinsBlogAboutHtml');
        if (typeof html !== 'string' || html.trim() === '') return null;
        return m('section', { className: 'LinkRobinsBlog-block LinkRobinsBlog-block--html' }, [
            title && title.trim() !== ''
                ? m('h4', { className: 'LinkRobinsBlog-block-title' }, title.trim())
                : null,
            m('div', {
                className: 'LinkRobinsBlog-block-body',
                oncreate:  function (vnode) { try { vnode.dom.innerHTML = html; } catch (e) {} },
                onupdate:  function (vnode) { try { vnode.dom.innerHTML = html; } catch (e) {} },
            }),
        ]);
    }, 100);

    // Newsletter subscribe helpers. State lives in a closure so the
    // multiple sidebar instances (desktop + mobile) share it and stay
    // in sync across redraws. Initial state from the forum payload.
    var _newsletter = {
        subscribed: null,
        busy:       false,
        error:      null,
    };

    function _newsletterInitState() {
        if (_newsletter.subscribed === null) {
            _newsletter.subscribed = !!readForumAttribute('linkrobinsBlogSubscribed');
        }
    }

    function _newsletterApiUrl() {
        return app.forum.attribute('apiUrl') + '/linkrobins-blog/subscription';
    }

    function _newsletterSetState(next) {
        for (var k in next) {
            if (Object.prototype.hasOwnProperty.call(next, k)) {
                _newsletter[k] = next[k];
            }
        }
        try { m.redraw(); } catch (e) {}
    }

    function _newsletterSubscribe() {
        if (_newsletter.busy) return;
        _newsletterSetState({ busy: true, error: null });
        app.request({ method: 'POST', url: _newsletterApiUrl() })
            .then(function (resp) {
                _newsletterSetState({
                    busy: false,
                    subscribed: !!(resp && resp.subscribed),
                });
            })
            .catch(function (err) {
                console.error('[linkrobins/blog] subscribe failed:', err);
                _newsletterSetState({
                    busy: false,
                    error: 'Could not subscribe. Please try again.',
                });
                try { alert('Could not subscribe. Please try again.'); } catch (e) {}
            });
    }

    function _newsletterUnsubscribe() {
        if (_newsletter.busy) return;
        _newsletterSetState({ busy: true, error: null });
        app.request({ method: 'DELETE', url: _newsletterApiUrl() })
            .then(function (resp) {
                _newsletterSetState({
                    busy: false,
                    subscribed: !!(resp && resp.subscribed),
                });
            })
            .catch(function (err) {
                console.error('[linkrobins/blog] unsubscribe failed:', err);
                _newsletterSetState({
                    busy: false,
                    error: 'Could not unsubscribe. Please try again.',
                });
                try { alert('Could not unsubscribe. Please try again.'); } catch (e) {}
            });
    }

    try { window.LinkRobinsBlogAddBlock = registerBlogBlock; } catch (e) {}

    function findIncluded(included, type, id) {
        if (!included || !id) return null;
        for (var i = 0; i < included.length; i++) {
            if (included[i].type === type && String(included[i].id) === String(id)) return included[i];
        }
        return null;
    }

    function relatedUser(post, included) {
        var rel = post.relationships && post.relationships.user && post.relationships.user.data;
        if (!rel) return null;
        return findIncluded(included, 'users', rel.id);
    }

    function relatedCategory(post, included) {
        var rel = post.relationships && post.relationships.category && post.relationships.category.data;
        if (!rel) return null;
        return findIncluded(included, 'linkrobins-blog-categories', rel.id);
    }

    function extractFirstParagraph(html) {
        if (!html) return '';
        try {
            var div = document.createElement('div');
            div.innerHTML = html;
            var p = div.querySelector('p');
            return p ? p.outerHTML : '';
        } catch (e) { return ''; }
    }

    function fetchPosts(opts) {
        var params = {
            sort:    '-publishedAt',
            page:    { offset: opts.offset || 0, limit: opts.limit || 12 },
            include: 'user,category',
        };
        if (opts.categoryId) {
            params.categoryId = opts.categoryId;
        }
        return app.request({
            method: 'GET',
            url:    app.forum.attribute('apiUrl') + '/linkrobins-blog-posts',
            params: params,
        });
    }

    function fetchPost(slug) {
        return app.request({
            method: 'GET',
            url:    app.forum.attribute('apiUrl') + '/linkrobins-blog-posts/' + encodeURIComponent(slug),
            params: { include: 'user,category' },
        });
    }

    function deleteBlogPost(postId) {
        return app.request({
            method: 'DELETE',
            url:    app.forum.attribute('apiUrl') + '/linkrobins-blog-posts/' + encodeURIComponent(postId),
        });
    }

    function submitOnCtrlEnter(callback) {
        return function (e) {
            if ((e.ctrlKey || e.metaKey) && (e.key === 'Enter' || e.keyCode === 13)) {
                e.preventDefault();
                callback();
            }
        };
    }

    function openLogIn() {
        try {
            var btn = document.querySelector('.Header-controls .Button.Button--link') ||
                      document.querySelector('.Header-controls a[href*="login"]') ||
                      document.querySelector('header.App-header .Header-controls li:last-child a, header.App-header .Header-controls li:last-child button');
            if (btn) { btn.click(); return; }
            m.route.set('/');
        } catch (e) {}
    }

    function init() {
        var Page         = null;
        var LinkButton   = null;
        var Button       = null;
        var LoadingIndicator = null;
        var PageStructure = null;
        var IndexSidebar  = null;
        try { Page             = flarum.reg.get('core', 'common/components/Page'); }             catch (e) {}
        try { LinkButton       = flarum.reg.get('core', 'common/components/LinkButton'); }       catch (e) {}
        try { Button           = flarum.reg.get('core', 'common/components/Button'); }           catch (e) {}
        try { LoadingIndicator = flarum.reg.get('core', 'common/components/LoadingIndicator'); } catch (e) {}
        try { PageStructure    = flarum.reg.get('core', 'forum/components/PageStructure'); }     catch (e) {}
        try { IndexSidebar     = flarum.reg.get('core', 'forum/components/IndexSidebar'); }      catch (e) {}

        if (!Page) {
            console.error('[linkrobins/blog] Page component not available; aborting.');
            return;
        }

        var BlogIndexSidebar = IndexSidebar ? makeBlogIndexSidebar(IndexSidebar, LinkButton, Button) : null;
        var BlogIndexPage    = makeBlogIndexPage(Page, LoadingIndicator, PageStructure, LinkButton, BlogIndexSidebar);
        var BlogPostPage     = makeBlogPostPage(Page, LoadingIndicator, PageStructure, LinkButton, BlogIndexSidebar);

        app.routes['linkrobins-blog.index']    = { path: '/' + BLOG_SLUG,                          component: BlogIndexPage };
        app.routes['linkrobins-blog.category'] = { path: '/category/:slug',                       component: BlogIndexPage };
        app.routes['linkrobins-blog.post']     = { path: '/' + ARTICLE_SLUG + '/:slug',            component: BlogPostPage  };

        // Note: blog-comment discussions are now ordinary, visible Flarum
        // discussions (just kept out of /all listings server-side). The blog
        // article page links out to the discussion at /d/{id} rather than
        // mounting a PostStream inline, so none of the old composer / route
        // patching is needed any more.

        try {
            var IndexSidebar = flarum.reg.get('core', 'forum/components/IndexSidebar');
            var extMod       = flarum.reg.get('core', 'common/extend');
            var extend       = extMod && extMod.extend;

            if (IndexSidebar && LinkButton && typeof extend === 'function') {
                extend(IndexSidebar.prototype, 'navItems', function (items) {
                    var bp       = basePath();
                    var priority = isBlogHomepage() ? 110 : 50;
                    var href     = isBlogHomepage() ? (bp + '/') : (bp + blogIndexRoute());
                    items.add(
                        'linkrobins-blog',
                        m(LinkButton, { href: href, icon: navIcon() }, navLabel()),
                        priority
                    );
                });
            }
        } catch (e) {
            console.error('[linkrobins/blog] could not extend IndexSidebar nav:', e);
        }
    }

    function makeBlogIndexSidebar(IndexSidebar, LinkButton, Button) {
        return class BlogIndexSidebar extends IndexSidebar {
            // The whole sidebar: a "Subscribe" primary button, the SelectDropdown nav,
            // then any registered blocks (About, Recent posts, etc.).
            items() {
                var ItemListCtor = null;
                try { ItemListCtor = flarum.reg.get('core', 'common/utils/ItemList'); } catch (e) {}
                var SelectDropdown = null;
                try { SelectDropdown = flarum.reg.get('core', 'common/components/SelectDropdown'); } catch (e) {}

                var items = ItemListCtor ? new ItemListCtor() : null;
                if (!items || !SelectDropdown) return items;

                // Newsletter subscribe button. Three states: guest (outline
                // star, click -> login), unsubscribed (outline star, click
                // -> POST), subscribed (filled star, click -> confirm +
                // DELETE). The icon change communicates state on mobile
                // where the label collapses to icon-only.
                if (Button) {
                    _newsletterInitState();
                    var loggedIn = !!(app.session && app.session.user);
                    var isSub    = !!_newsletter.subscribed;
                    var busy     = !!_newsletter.busy;

                    var icon, label, onclick, extraClass;
                    if (!loggedIn) {
                        icon       = 'far fa-star';
                        label      = 'Subscribe';
                        extraClass = '';
                        onclick    = openLogIn;
                    } else if (isSub) {
                        icon       = 'fas fa-star';
                        label      = busy ? 'Working\u2026' : 'Subscribed';
                        extraClass = ' is-subscribed';
                        onclick    = function () {
                            if (_newsletter.busy) return;
                            var ok = false;
                            try {
                                ok = window.confirm('Unsubscribe from the newsletter?');
                            } catch (e) { ok = true; }
                            if (ok) _newsletterUnsubscribe();
                        };
                    } else {
                        icon       = 'far fa-star';
                        label      = busy ? 'Subscribing\u2026' : 'Subscribe';
                        extraClass = '';
                        onclick    = _newsletterSubscribe;
                    }

                    items.add(
                        'subscribe',
                        m(Button, {
                            icon:          icon,
                            className:     'Button Button--primary LinkRobinsBlog-subscribeButton' + extraClass,
                            itemClassName: 'App-primaryControl',
                            disabled:      busy,
                            'aria-label':  label,
                            title:         label,
                            onclick:       onclick,
                        }, label),
                        100
                    );
                }

                items.add(
                    'nav',
                    m(SelectDropdown, {
                        buttonClassName: 'Button',
                        className:       'App-titleControl',
                    }, this.navItems().toArray()),
                    90
                );

                // Sidebar blocks rendered below the nav. Extensions register via
                // window.LinkRobinsBlogAddBlock(id, factory, priority).
                var blocksCtx = {
                    isPostPage: !!(this.attrs && this.attrs.isPostPage),
                };
                var blocksNode = renderBlogBlocks(blocksCtx, 'LinkRobinsBlog-blocks--sidebar');
                if (blocksNode) {
                    items.add('blocks', blocksNode, 50);
                }

                return items;
            }

            navItems() {
                var ItemListCtor = null;
                try { ItemListCtor = flarum.reg.get('core', 'common/utils/ItemList'); } catch (e) {}
                var items = ItemListCtor ? new ItemListCtor() : null;
                if (!items || !LinkButton) return items;

                var bp         = basePath();
                var blogHome   = isBlogHomepage();
                var allHref    = blogHome ? (bp + '/') : (bp + blogIndexRoute());
                var activeSlug = (this.attrs && this.attrs.activeCategorySlug) || null;
                var isPostView = !!(this.attrs && this.attrs.isPostPage);
                var allActive  = !activeSlug && !isPostView;

                items.add(
                    'allPosts',
                    m(LinkButton, {
                        href:   allHref,
                        icon:   navIcon(),
                        active: allActive,
                    }, navLabel() || 'All posts'),
                    100
                );

                // Forum link sits right under the blog link.
                var forumHref = blogHome ? (bp + '/all') : (bp + '/');
                items.add(
                    'forumLink',
                    m(LinkButton, {
                        href: forumHref,
                        icon: 'far fa-comments',
                    }, 'Forum'),
                    90
                );

                var cats = _allCategoriesCache || [];
                if (cats.length) {
                    items.add(
                        'categoriesHeading',
                        m('h4', { className: 'LinkRobinsBlog-sidebar-sectionHeading' }, 'Categories'),
                        80
                    );

                    cats.forEach(function (cat, i) {
                        var attr   = cat.attributes || {};
                        var slug   = attr.slug || cat.id;
                        var href   = bp + categoryPath(cat);
                        var active = activeSlug === slug;
                        var icon   = attr.icon  || 'fas fa-folder';
                        var color  = attr.color || null;

                        items.add(
                            'category-' + slug,
                            m(LinkButton, {
                                href:      href,
                                icon:      icon,
                                active:    active,
                                className: 'LinkRobinsBlog-sidebar-categoryLink',
                                style:     color ? ('--blog-cat-color: ' + color) : '',
                                title:     attr.description || attr.name,
                            }, attr.name),
                            70 - i
                        );
                    });
                }

                return items;
            }
        };
    }

    function makeBlogIndexPage(Page, LoadingIndicator, PageStructure, LinkButton, BlogIndexSidebar) {
        return class BlogIndexPage extends Page {
            oninit(vnode) {
                super.oninit(vnode);
                this.loading     = true;
                this.loadingMore = false;
                this.posts       = [];
                this.included    = [];
                this.offset      = 0;
                this.hasMore     = true;
                this.category    = null;
                this.error       = null;

                try {
                    app.setTitle('');
                    app.setTitleCount(0);
                } catch (e) {}

                this._currentSlug = this.attrs && this.attrs.slug || null;
                this._load();
                loadAllCategories().then(function () { try { m.redraw(); } catch (e) {} });
            }

            onupdate(vnode) {
                if (super.onupdate) super.onupdate(vnode);
                var newSlug = this.attrs && this.attrs.slug || null;
                if (newSlug !== this._currentSlug) {
                    this._currentSlug = newSlug;
                    this.loading = true;
                    this.posts   = [];
                    this.included = [];
                    this.offset  = 0;
                    this.hasMore = true;
                    this.category = null;
                    this._load();
                }
                this._installScrollObserver();
            }

            oncreate(vnode) {
                try { if (super.oncreate) super.oncreate(vnode); } catch (e) { console.error('[linkrobins/blog] super.oncreate threw:', e); }
                try { applyBlogBodyClass(true); } catch (e) {}
                try { this._installScrollObserver(); } catch (e) {}
            }

            onremove(vnode) {
                try { applyBlogBodyClass(false); } catch (e) {}
                try { this._teardownScrollObserver(); } catch (e) {}
                try { if (super.onremove) super.onremove(vnode); } catch (e) {}
            }

            _load() {
                var self = this;
                var categoryId = null;

                var run = function () {
                    fetchPosts({ offset: 0, limit: postsPerPage(), categoryId: categoryId })
                        .then(function (resp) {
                            self.posts    = resp.data || [];
                            self.included = resp.included || [];
                            self.offset   = self.posts.length;
                            self.hasMore  = !!(resp.links && resp.links.next);
                            self.loading  = false;
                            m.redraw();
                        })
                        .catch(function (err) {
                            self.error   = err;
                            self.loading = false;
                            console.error('[linkrobins/blog] failed to load posts:', err);
                            m.redraw();
                        });
                };

                if (this._currentSlug) {
                    app.request({
                        method: 'GET',
                        url:    app.forum.attribute('apiUrl') + '/linkrobins-blog-categories/' + encodeURIComponent(this._currentSlug),
                    }).then(function (resp) {
                        if (resp && resp.data) {
                            self.category = resp.data;
                            categoryId    = resp.data.id;
                        }
                        run();
                    }).catch(function (err) {
                        self.error   = err;
                        self.loading = false;
                        console.error('[linkrobins/blog] failed to load category:', err);
                        m.redraw();
                    });
                } else {
                    run();
                }
            }

            _loadMore() {
                if (this.loading || this.loadingMore || !this.hasMore) return;
                var self = this;
                self.loadingMore = true;
                m.redraw();

                var categoryId = self.category ? self.category.id : null;

                fetchPosts({ offset: self.offset, limit: postsPerPage(), categoryId: categoryId })
                    .then(function (resp) {
                        var fresh = resp.data || [];
                        var seen  = {};
                        self.posts.forEach(function (p) { seen[p.id] = true; });
                        fresh.forEach(function (p) {
                            if (!seen[p.id]) self.posts.push(p);
                        });
                        if (resp.included) {
                            var seenInc = {};
                            self.included.forEach(function (i) { seenInc[i.type + ':' + i.id] = true; });
                            resp.included.forEach(function (i) {
                                if (!seenInc[i.type + ':' + i.id]) self.included.push(i);
                            });
                        }
                        self.offset      = self.posts.length;
                        self.hasMore     = !!(resp.links && resp.links.next);
                        self.loadingMore = false;
                        m.redraw();
                    })
                    .catch(function (err) {
                        self.loadingMore = false;
                        console.error('[linkrobins/blog] failed to load more posts:', err);
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
                }, { rootMargin: '600px 0px' });
                this._observer.observe(sentinel);
            }

            _teardownScrollObserver() {
                if (this._observer) {
                    try { this._observer.disconnect(); } catch (e) {}
                    this._observer = null;
                }
            }

            view() {
                try {
                    return this._safeView();
                } catch (e) {
                    console.error('[linkrobins/blog] index view crashed:', e);
                    return m('div', { className: 'LinkRobinsBlog' },
                        m('div', { className: 'LinkRobinsBlog-empty' }, 'Something went wrong rendering the blog. Try refreshing the page.')
                    );
                }
            }

            _safeView() {
                var self = this;

                var content;
                if (self.loading) {
                    content = LoadingIndicator ? m(LoadingIndicator) : m('div', null, 'Loading...');
                } else if (self.error) {
                    content = m('div', { className: 'LinkRobinsBlog-empty' }, 'Something went wrong loading the blog.');
                } else if (!self.posts.length) {
                    content = m('div', { className: 'LinkRobinsBlog-empty' }, 'No posts here yet.');
                } else {
                    var featured = self.posts[0];
                    var rest     = self.posts.slice(1);
                    content = [
                        self._renderFeatured(featured),
                        m('div', { className: 'LinkRobinsBlog-grid' },
                            rest.map(self._renderCard.bind(self))
                        ),
                        self._renderLoadMore(),
                    ];
                }

                var mobileBlocks = renderBlogBlocks({ isPostPage: false }, 'LinkRobinsBlog-blocks--mobile');

                if (PageStructure) {
                    return m(PageStructure, {
                        className: 'IndexPage LinkRobinsBlog-page LinkRobinsBlog-page--index',
                        hero:      function () { return self._renderHero(); },
                        sidebar:   function () { return self._renderSidebar(); },
                    }, m('div', { className: 'LinkRobinsBlog' }, [content, mobileBlocks]));
                }

                // Fallback if PageStructure isn't available
                return m('div', { className: 'LinkRobinsBlog' }, [
                    self._renderHero(),
                    content,
                    mobileBlocks,
                ]);
            }

            _renderSidebar() {
                try {
                    var self = this;
                    var activeSlug = (self.category && self.category.attributes) ? (self.category.attributes.slug || self.category.id) : null;
                    if (!_allCategoriesCache) {
                        loadAllCategories().then(function () { try { m.redraw(); } catch (e) {} });
                    }
                    if (BlogIndexSidebar) {
                        return m(BlogIndexSidebar, {
                            className:          'LinkRobinsBlog-sidebar',
                            activeCategorySlug: activeSlug,
                            isPostPage:         false,
                        });
                    }
                } catch (e) {
                    console.error('[linkrobins/blog] sidebar render failed:', e);
                }
                return null;
            }

            _renderHero() {
                var tagline = this.category ? '' : siteTagline();
                var titleNode;
                if (this.category) {
                    titleNode = m('h1', { className: 'LinkRobinsBlog-hero-title' }, this.category.attributes.name);
                } else {
                    titleNode = this._renderHeroBranding();
                }

                var bgMode    = readForumAttribute('linkrobinsBlogHeroBgMode') || 'none';
                var bgUrl     = readForumAttribute('linkrobinsBlogHeroBgUrl')  || '';
                var overlay   = parseInt(readForumAttribute('linkrobinsBlogHeroOverlay') || '40', 10);
                if (isNaN(overlay) || overlay < 0) overlay = 0;
                if (overlay > 90) overlay = 90;
                var alpha = overlay / 100;

                var heroClass = 'LinkRobinsBlog-hero';
                var bgStyle   = '';
                if (bgMode === 'image' && bgUrl) {
                    heroClass += ' LinkRobinsBlog-hero--withBg';
                    bgStyle = 'background-image: linear-gradient(rgba(0,0,0,' + alpha + '), rgba(0,0,0,' + alpha + ')), url("' + String(bgUrl).replace(/"/g, '%22') + '");';
                } else if (bgMode === 'gradient') {
                    heroClass += ' LinkRobinsBlog-hero--withBg LinkRobinsBlog-hero--gradient';
                    bgStyle = 'background-image: linear-gradient(rgba(0,0,0,' + alpha + '), rgba(0,0,0,' + alpha + ')), linear-gradient(135deg, var(--primary-color, #ff7e5f), var(--secondary-color, #1a2535));';
                }

                return m('header', { className: heroClass, style: bgStyle },
                    m('div', { className: 'container' },
                        m('div', { className: 'LinkRobinsBlog-hero-inner' }, [
                            titleNode,
                            tagline ? m('p', { className: 'LinkRobinsBlog-hero-tagline' }, tagline) : null,
                            this.category && this.category.attributes.description
                                ? m('p', { className: 'LinkRobinsBlog-hero-tagline' }, this.category.attributes.description)
                                : null,
                        ])
                    )
                );
            }

            _renderHeroBranding() {
                var mode = readForumAttribute('linkrobinsBlogHeaderMode') || 'text';
                var title = siteTitle();
                var bp = basePath();
                var heroHref = isBlogHomepage() ? (bp + '/') : (bp + blogIndexRoute());

                var imgLight = null;
                var imgDark  = null;

                if (mode === 'logo') {
                    imgLight = app.forum && app.forum.attribute('logoUrl');
                    imgDark  = app.forum && app.forum.attribute('logoDarkModeUrl');
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
                        onclick: function (e) { safeNavigate(heroHref, e); },
                    }, nodes);
                }

                return m('h1', { className: 'LinkRobinsBlog-hero-title' }, title);
            }

            _renderFeatured(post) {
                var attr = post.attributes;
                var author = relatedUser(post, this.included);
                var cat    = relatedCategory(post, this.included);
                var cover  = attr.coverImageUrl || null;
                var path   = postPath(post);

                return m('section', { className: 'LinkRobinsBlog-featured' },
                    m('a', {
                        href: path,
                        className: 'LinkRobinsBlog-featured-card' + (cover ? ' has-cover' : ' no-cover'),
                        onclick: function (e) { safeNavigate(path, e); },
                        // encodeURI ensures CSS-syntax characters in the URL
                        // (quotes, parens, braces, newlines) can't break out
                        // of url(...) and inject extra CSS declarations.
                        style: cover ? ('background-image: url("' + encodeURI(cover) + '");') : null,
                    }, [
                        m('div', { className: 'LinkRobinsBlog-featured-inner' }, [
                            cat ? m('div', { className: 'LinkRobinsBlog-tags' },
                                m('span', { className: 'LinkRobinsBlog-tag', style: 'color: ' + (cat.attributes.color || 'inherit') }, cat.attributes.name)
                            ) : null,
                            m('h2', { className: 'LinkRobinsBlog-featured-title' }, attr.title),
                            this._renderMeta(author, attr.publishedAt || attr.createdAt, attr),
                        ]),
                    ])
                );
            }

            _renderCard(post) {
                var attr   = post.attributes;
                var author = relatedUser(post, this.included);
                var cat    = relatedCategory(post, this.included);
                var cover  = attr.coverImageUrl || null;
                var path   = postPath(post);

                return m('a', {
                    href: path,
                    className: 'LinkRobinsBlog-card',
                    onclick: function (e) { safeNavigate(path, e); },
                    key: 'p-' + post.id,
                }, [
                    m('div', { className: 'LinkRobinsBlog-card-cover' + (cover ? ' has-cover' : ' no-cover') },
                        cover ? m('img', { src: cover, alt: '', loading: 'lazy' }) : null
                    ),
                    m('div', { className: 'LinkRobinsBlog-card-body' }, [
                        cat ? m('div', { className: 'LinkRobinsBlog-tags' },
                            m('span', { className: 'LinkRobinsBlog-tag', style: 'color: ' + (cat.attributes.color || 'inherit') }, cat.attributes.name)
                        ) : null,
                        m('h3', { className: 'LinkRobinsBlog-card-title' }, attr.title),
                        this._renderMeta(author, attr.publishedAt || attr.createdAt, attr),
                    ]),
                ]);
            }

            _renderMeta(author, dateIso, attr, opts) {
                opts = opts || {};
                var children = [];
                if (author) {
                    var name = author.attributes.displayName || author.attributes.username || '';
                    var href = opts.allowLink ? userPath(author) : null;
                    if (href) {
                        children.push(m('a', {
                            href: href,
                            className: 'LinkRobinsBlog-meta-author',
                            onclick: function (e) { safeNavigate(href, e); },
                        }, name));
                    } else {
                        children.push(m('span', { className: 'LinkRobinsBlog-meta-author' }, name));
                    }
                }
                var dateStr = formatDate(dateIso);
                if (dateStr) {
                    if (children.length) children.push(m('span', { className: 'LinkRobinsBlog-meta-dot' }, '·'));
                    children.push(m('span', { className: 'LinkRobinsBlog-meta-date' }, dateStr));
                }
                if (attr && attr.visibility === 'members') {
                    if (children.length) children.push(m('span', { className: 'LinkRobinsBlog-meta-dot' }, '·'));
                    children.push(m('span', { className: 'LinkRobinsBlog-meta-badge' }, [
                        m('i', { className: 'fas fa-lock' }), ' Members'
                    ]));
                }
                if (!children.length) return null;
                return m('div', { className: 'LinkRobinsBlog-meta' }, children);
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
                              }, 'Load more')
                            : null,
                ]);
            }
        };
    }

    function makeBlogPostPage(Page, LoadingIndicator, PageStructure, LinkButton, BlogIndexSidebar) {
        return class BlogPostPage extends Page {
            oninit(vnode) {
                super.oninit(vnode);
                this.loading        = true;
                this.error          = null;
                this.post           = null;
                this.included       = [];
                // The comment thread lives in a normal Flarum discussion. We
                // fetch the discussion record only to get its canonical route
                // for the "Read more comments" link; the displayed count comes
                // from attr.commentCount (live-computed server-side on every
                // post fetch). The full conversation is one click away.
                this.discussion       = null;
                this.commentsLoading  = false;
                this.actionsMenuOpen  = false;
                this.deletingPost     = false;

                this._currentSlug = stripDatePrefix(this.attrs && this.attrs.slug || null);
                this._load();
            }

            onupdate(vnode) {
                if (super.onupdate) super.onupdate(vnode);
                var newSlug = stripDatePrefix(this.attrs && this.attrs.slug || null);
                if (newSlug !== this._currentSlug) {
                    this._currentSlug = newSlug;
                    this.loading = true;
                    this.post    = null;
                    this.discussion = null;
                    this._load();
                }
            }

            oncreate(vnode) {
                try { if (super.oncreate) super.oncreate(vnode); } catch (e) { console.error('[linkrobins/blog] super.oncreate threw:', e); }
                try { applyBlogBodyClass(true); } catch (e) {}
            }

            onremove(vnode) {
                try { applyBlogBodyClass(false); } catch (e) {}
                try { if (super.onremove) super.onremove(vnode); } catch (e) {}
            }

            _load() {
                var self = this;
                if (!self._currentSlug) {
                    self.loading = false;
                    self.error   = new Error('no slug');
                    return;
                }
                fetchPost(self._currentSlug)
                    .then(function (resp) {
                        self.post     = resp.data;
                        self.included = resp.included || [];
                        self.loading  = false;
                        try {
                            var t = self.post && self.post.attributes && self.post.attributes.title;
                            if (t) app.setTitle(t);
                        } catch (e) {}
                        m.redraw();
                        self._loadDiscussion();
                    })
                    .catch(function (err) {
                        self.error   = err;
                        self.loading = false;
                        console.error('[linkrobins/blog] failed to load post:', err);
                        m.redraw();
                    });
            }

            _loadDiscussion() {
                var self = this;
                if (!self.post) return;
                var attr = self.post.attributes || {};
                var discussionId = attr.discussionId;
                if (!discussionId) {
                    // No comment discussion for this post — it's either
                    // unpublished or has comments disabled. Nothing to load.
                    self.discussion = null;
                    self.commentsLoading = false;
                    m.redraw();
                    return;
                }
                self.commentsLoading = true;
                m.redraw();

                // Fetch only the discussion record so we have its canonical
                // route (/d/{id}-{slug}) for the "Read more comments" link.
                // The displayed comment count comes from attr.commentCount,
                // which is computed live server-side on every blog-post fetch
                // — so we never need the actual posts here. Anyone wanting to
                // read or reply clicks through to the discussion itself.
                app.store.find('discussions', String(discussionId))
                    .then(function (discussion) {
                        self.discussion = discussion;
                        self.commentsLoading = false;
                        m.redraw();
                    })
                    .catch(function (err) {
                        self.commentsLoading = false;
                        self.discussion = null;
                        console.error('[linkrobins/blog] failed to load comment discussion:', err);
                        m.redraw();
                    });
            }

            _togglePostActionsMenu() {
                this.actionsMenuOpen = !this.actionsMenuOpen;
            }

            _editPost() {
                this.actionsMenuOpen = false;
                try { alert('Post editing UI is coming in Phase 3. For now, use the API directly.'); } catch (e) {}
            }

            _deletePost() {
                var self = this;
                self.actionsMenuOpen = false;
                if (self.deletingPost) return;
                if (!self.post) return;

                var ok = false;
                try { ok = window.confirm('Delete this post? This cannot be undone.'); } catch (e) {}
                if (!ok) return;

                self.deletingPost = true;
                m.redraw();

                deleteBlogPost(self.post.id)
                    .then(function () {
                        m.route.set(blogIndexRoute());
                    })
                    .catch(function (err) {
                        self.deletingPost = false;
                        console.error('[linkrobins/blog] failed to delete post:', err);
                        try { alert('Could not delete the post.'); } catch (e) {}
                        m.redraw();
                    });
            }

            view() {
                try {
                    return this._safeView();
                } catch (e) {
                    console.error('[linkrobins/blog] post view crashed:', e);
                    return m('div', { className: 'LinkRobinsBlog LinkRobinsBlog--post' },
                        m('div', { className: 'LinkRobinsBlog-empty' }, 'Something went wrong rendering this post. Try refreshing the page.')
                    );
                }
            }

            _safeView() {
                var self = this;
                var content;
                if (self.loading) {
                    content = LoadingIndicator ? m(LoadingIndicator) : m('div', null, 'Loading...');
                } else if (self.error || !self.post) {
                    content = m('div', { className: 'LinkRobinsBlog-empty' }, 'Post not found.');
                } else {
                    var attr   = self.post.attributes;
                    var author = relatedUser(self.post, self.included);
                    var cat    = relatedCategory(self.post, self.included);
                    var cover  = attr.coverImageUrl || null;
                    content = [
                        m('article', { className: 'LinkRobinsBlog-post' }, [
                            m('header', { className: 'LinkRobinsBlog-post-header' }, [
                                cat ? m('div', { className: 'LinkRobinsBlog-tags LinkRobinsBlog-post-tags' },
                                    m('a', {
                                        href: categoryPath(cat),
                                        className: 'LinkRobinsBlog-tag',
                                        style: 'color: ' + (cat.attributes.color || 'inherit'),
                                        onclick: function (e) { safeNavigate(categoryPath(cat), e); },
                                    }, cat.attributes.name)
                                ) : null,
                                attr.isPublished === false ? m('div', { className: 'LinkRobinsBlog-post-draftBadge' }, [
                                    m('i', { className: 'fas fa-eye-slash' }), ' Draft'
                                ]) : null,
                                m('h1', { className: 'LinkRobinsBlog-post-title' }, attr.title),
                                (attr.excerpt && attr.excerpt.trim()) ? m('p', { className: 'LinkRobinsBlog-post-excerpt' }, attr.excerpt) : null,
                                self._renderPostMeta(author, attr),
                            ]),
                            cover ? m('div', { className: 'LinkRobinsBlog-post-cover' }, [
                                m('img', { src: cover, alt: attr.title }),
                                (attr.coverImageCredit && String(attr.coverImageCredit).trim() !== '')
                                    ? m('div', { className: 'LinkRobinsBlog-post-coverCredit' },
                                        String(attr.coverImageCredit))
                                    : null,
                            ]) : null,
                            self._renderBody(attr),
                        ]),
                        self._renderCommentsSection(attr),
                        self._renderRelatedPosts(attr),
                    ];
                }

                if (PageStructure) {
                    return m(PageStructure, {
                        className: 'LinkRobinsBlog-page LinkRobinsBlog-page--post',
                        sidebar:   function () { return self._renderSidebar(); },
                    }, m('div', { className: 'LinkRobinsBlog LinkRobinsBlog--post' }, [content, self._renderMobileBlocks()]));
                }

                return m('div', { className: 'LinkRobinsBlog LinkRobinsBlog--post' }, [content, self._renderMobileBlocks()]);
            }

            _renderMobileBlocks() {
                if (!this.post) return null;
                return renderBlogBlocks({ isPostPage: true, post: this.post }, 'LinkRobinsBlog-blocks--mobile');
            }

            _renderSidebar() {
                try {
                    var self = this;
                    var cat = self.post ? relatedCategory(self.post, self.included) : null;
                    var activeSlug = (cat && cat.attributes) ? (cat.attributes.slug || cat.id) : null;
                    if (!_allCategoriesCache) {
                        loadAllCategories().then(function () { try { m.redraw(); } catch (e) {} });
                    }
                    if (BlogIndexSidebar) {
                        return m(BlogIndexSidebar, {
                            className:          'LinkRobinsBlog-sidebar',
                            activeCategorySlug: activeSlug,
                            isPostPage:         true,
                        });
                    }
                } catch (e) {
                    console.error('[linkrobins/blog] sidebar render failed:', e);
                }
                return null;
            }

            _renderPostActions(attr) {
                if (!attr.canEdit && !attr.canDelete) return null;
                var self = this;
                var open = self.actionsMenuOpen;

                return m('div', { className: 'LinkRobinsBlog-post-actions' }, [
                    m('button', {
                        type:      'button',
                        className: 'LinkRobinsBlog-post-actions-toggle',
                        title:     'Post actions',
                        'aria-haspopup': 'true',
                        'aria-expanded': open ? 'true' : 'false',
                        onclick:   function (e) {
                            e.stopPropagation();
                            self._togglePostActionsMenu();
                        },
                    }, m('i', { className: 'fas fa-ellipsis-h' })),
                    open ? m('div', {
                        className: 'LinkRobinsBlog-post-actions-menu',
                        oncreate: function (vnode) {
                            self._closeMenuHandler = function (e) {
                                if (!vnode.dom.contains(e.target)) {
                                    self.actionsMenuOpen = false;
                                    m.redraw();
                                }
                            };
                            setTimeout(function () {
                                document.addEventListener('click', self._closeMenuHandler);
                            }, 0);
                        },
                        onremove: function () {
                            if (self._closeMenuHandler) {
                                document.removeEventListener('click', self._closeMenuHandler);
                                self._closeMenuHandler = null;
                            }
                        },
                    }, [
                        attr.canEdit ? m('button', {
                            type:      'button',
                            className: 'LinkRobinsBlog-post-actions-item',
                            onclick:   function () { self._editPost(); },
                        }, [m('i', { className: 'fas fa-pencil-alt' }), ' Edit post']) : null,
                        attr.canDelete ? m('button', {
                            type:      'button',
                            className: 'LinkRobinsBlog-post-actions-item LinkRobinsBlog-post-actions-item--danger',
                            disabled:  self.deletingPost,
                            onclick:   function () { self._deletePost(); },
                        }, [m('i', { className: 'fas fa-trash' }), ' ', self.deletingPost ? 'Deleting…' : 'Delete post']) : null,
                    ]) : null,
                ]);
            }

            _renderPostMeta(author, attr) {
                var children = [];
                if (author) {
                    var av    = author.attributes.avatarUrl;
                    var name  = author.attributes.displayName || author.attributes.username || '';
                    var href  = userPath(author);

                    if (av) {
                        if (href) {
                            children.push(m('a', {
                                href: href,
                                className: 'LinkRobinsBlog-post-meta-avatarLink',
                                onclick: function (e) { safeNavigate(href, e); },
                            }, m('img', { src: av, alt: '', className: 'LinkRobinsBlog-post-meta-avatar' })));
                        } else {
                            children.push(m('img', { src: av, alt: '', className: 'LinkRobinsBlog-post-meta-avatar' }));
                        }
                    }

                    if (href) {
                        children.push(m('a', {
                            href: href,
                            className: 'LinkRobinsBlog-post-meta-author',
                            onclick: function (e) { safeNavigate(href, e); },
                        }, name));
                    } else {
                        children.push(m('span', { className: 'LinkRobinsBlog-post-meta-author' }, name));
                    }
                }
                var dateStr = formatDate(attr.publishedAt || attr.createdAt);
                if (dateStr) {
                    if (children.length) children.push(m('span', { className: 'LinkRobinsBlog-meta-dot' }, '·'));
                    children.push(m('span', { className: 'LinkRobinsBlog-post-meta-date' }, dateStr));
                }
                if (attr.visibility === 'members') {
                    if (children.length) children.push(m('span', { className: 'LinkRobinsBlog-meta-dot' }, '·'));
                    children.push(m('span', { className: 'LinkRobinsBlog-meta-badge' }, [
                        m('i', { className: 'fas fa-lock' }), ' Members'
                    ]));
                }
                return m('div', { className: 'LinkRobinsBlog-post-meta' }, children);
            }

            _renderBody(attr) {
                if (attr.canViewBody === false) {
                    return this._renderMemberWall(attr);
                }
                var html = attr.contentHtml || '';
                return m('div', {
                    className: 'LinkRobinsBlog-post-body',
                    oncreate:  function (vnode) { try { vnode.dom.innerHTML = html; } catch (e) { console.error('[linkrobins/blog] body render failed:', e); } },
                    onupdate:  function (vnode) { try { vnode.dom.innerHTML = html; } catch (e) { console.error('[linkrobins/blog] body render failed:', e); } },
                });
            }

            _renderMemberWall(attr) {
                // The API gives us pre-rendered teaserHtml (the first N characters
                // of the post, truncated on a word boundary), gated server-side by
                // the linkrobinsBlogMembersTeaserChars setting.
                // Fall back to excerpt if for any reason teaserHtml isn't available.
                var teaserHtml = '';
                if (typeof attr.teaserHtml === 'string' && attr.teaserHtml.trim() !== '') {
                    teaserHtml = attr.teaserHtml;
                } else if (attr.excerpt && attr.excerpt.trim() !== '') {
                    teaserHtml = '<p>' + String(attr.excerpt).replace(/</g, '&lt;') + '</p>';
                }
                var loggedIn = app.session && app.session.user;
                return m('div', { className: 'LinkRobinsBlog-post-body LinkRobinsBlog-post-body--gated' }, [
                    teaserHtml ? m('div', {
                        className: 'LinkRobinsBlog-teaser',
                        oncreate:  function (vnode) { try { vnode.dom.innerHTML = teaserHtml; } catch (e) {} },
                        onupdate:  function (vnode) { try { vnode.dom.innerHTML = teaserHtml; } catch (e) {} },
                    }) : null,
                    m('div', { className: 'LinkRobinsBlog-memberWall' }, [
                        m('i', { className: 'fas fa-lock LinkRobinsBlog-memberWall-icon' }),
                        m('h3', { className: 'LinkRobinsBlog-memberWall-title' }, 'Members only'),
                        m('p',  { className: 'LinkRobinsBlog-memberWall-text' },
                            loggedIn
                                ? "Your account doesn't have access to this post."
                                : 'Log in or sign up to keep reading.'),
                        loggedIn ? null : m('button', {
                            type:      'button',
                            className: 'Button Button--primary LinkRobinsBlog-memberWall-button',
                            onclick:   openLogIn,
                        }, 'Log in to continue'),
                    ]),
                ]);
            }

            _renderCommentsSection(attr) {
                // Hide the section if the user can't even see the body
                // (member wall is showing instead).
                if (attr.canViewBody === false) return null;

                var self = this;
                var commentsDisabled = attr.commentsEnabled === false;
                var discussion = self.discussion;
                var discussionId = attr.discussionId;

                // Comment count comes from attr.commentCount, computed live
                // server-side on every blog-post fetch — always current.
                var count = 0;
                try {
                    if (typeof attr.commentCount === 'number') {
                        count = attr.commentCount;
                    }
                } catch (e) { count = 0; }

                // Build the link into the full conversation. Prefer the
                // loaded discussion model's canonical route (/d/{id}-{slug}),
                // fall back to /d/{id} from the attribute — so the link still
                // works even if the discussion record fetch hasn't returned
                // yet or quietly failed.
                var discussionHref = null;
                if (discussion) {
                    try {
                        discussionHref = app.route.discussion(discussion);
                    } catch (e) {
                        discussionHref = '/d/' + discussion.id();
                    }
                } else if (discussionId) {
                    discussionHref = '/d/' + discussionId;
                }

                // No discussion at all (unpublished / comments disabled with
                // no thread): render nothing.
                if (!discussionHref && !self.commentsLoading) {
                    return null;
                }

                var countLabel = count === 0 ? 'No comments yet'
                               : count === 1 ? '1 comment'
                               : (count + ' comments');

                var actionLabel = count === 0 ? 'Start the discussion →'
                                              : 'Read more comments →';

                var body;
                if (commentsDisabled) {
                    body = m('div', { className: 'LinkRobinsBlog-comments-disabledNote' }, [
                        m('i', { className: 'fas fa-comment-slash' }),
                        ' Comments are closed for this post.',
                    ]);
                } else if (discussionHref) {
                    body = m('a', {
                        href: discussionHref,
                        className: 'LinkRobinsBlog-comments-link',
                        onclick: function (e) { safeNavigate(discussionHref, e); },
                    }, [
                        m('span', { className: 'LinkRobinsBlog-comments-linkCount' }, [
                            m('i', { className: 'far fa-comments' }),
                            ' ',
                            countLabel,
                        ]),
                        m('span', { className: 'LinkRobinsBlog-comments-linkAction' }, actionLabel),
                    ]);
                } else {
                    body = m('div', { className: 'LinkRobinsBlog-comments-loading' }, 'Loading…');
                }

                return m('section', {
                    className: 'LinkRobinsBlog-comments' + (commentsDisabled ? ' LinkRobinsBlog-comments--disabled' : ''),
                }, body);
            }

            _renderRelatedPosts(attr) {
                // "You may also like" -- 3 recommended posts from the same
                // category (with a most-recent fallback if there aren't
                // enough). The list comes pre-built from the API
                // (BlogPostResource::relatedPosts), so this method is
                // purely presentational. Hidden if the API didn't return any
                // related posts, or if the viewer can't read the body (we
                // don't want to flash recommendations under a paywall).
                if (attr.canViewBody === false) return null;
                var related = attr.relatedPosts;
                if (!Array.isArray(related) || related.length === 0) return null;

                return m('section', { className: 'LinkRobinsBlog-related' }, [
                    m('h3', { className: 'LinkRobinsBlog-related-heading' }, 'Read more'),
                    m('div', { className: 'LinkRobinsBlog-related-grid' },
                        related.map(function (rp) {
                            // The related-post payload is a flat object built
                            // server-side -- not a JSON:API resource -- so we
                            // build the path manually rather than going
                            // through postPath/datedSlugFor.
                            var dated = rp.slug;
                            if (rp.publishedAt) {
                                try {
                                    var d = new Date(rp.publishedAt);
                                    if (!isNaN(d.getTime())) {
                                        var y = d.getUTCFullYear();
                                        var mo = String(d.getUTCMonth() + 1).padStart(2, '0');
                                        var da = String(d.getUTCDate()).padStart(2, '0');
                                        dated = y + '-' + mo + '-' + da + '-' + rp.slug;
                                    }
                                } catch (e) {}
                            }
                            var path = '/' + ARTICLE_SLUG + '/' + dated;
                            var cat  = rp.category || null;
                            var cover = rp.coverImageUrl || null;
                            var dateStr = rp.publishedAt ? formatDate(rp.publishedAt) : '';

                            return m('a', {
                                href:      path,
                                className: 'LinkRobinsBlog-related-card',
                                onclick:   function (e) { safeNavigate(path, e); },
                                key:       'rp-' + rp.id,
                            }, [
                                m('div', { className: 'LinkRobinsBlog-related-cover' + (cover ? ' has-cover' : ' no-cover') },
                                    cover ? m('img', { src: cover, alt: '', loading: 'lazy' }) : null
                                ),
                                m('div', { className: 'LinkRobinsBlog-related-body' }, [
                                    cat ? m('span', {
                                        className: 'LinkRobinsBlog-related-tag',
                                        style: cat.color ? ('color: ' + cat.color) : null,
                                    }, cat.name) : null,
                                    m('h4', { className: 'LinkRobinsBlog-related-title' }, rp.title),
                                    dateStr ? m('div', { className: 'LinkRobinsBlog-related-date' }, dateStr) : null,
                                ]),
                            ]);
                        })
                    ),
                ]);
            }

        };
    }

    if (typeof app !== 'undefined' && app.initializers && typeof app.initializers.add === 'function') {
        app.initializers.add('linkrobins-blog', init);
    }

})();

module.exports = {};
