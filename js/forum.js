'use strict';

(function () {

    // Short helper for translator lookups. Returns the translated string, or
    // the key itself if no translation is registered (Flarum's default
    // fallback behaviour). All forum-side strings live under
    // 'linkrobins-blog.forum.*' or 'linkrobins-blog.ref.*'. Named tr() so
    // it doesn't shadow existing local 't' variables in this file.
    function tr(key, params) {
        try {
            return app.translator.trans('linkrobins-blog.' + key, params || {});
        } catch (e) {
            return key;
        }
    }

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
        return readForumAttribute('title') || tr('ref.blog');
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
        return tr('ref.blog');
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

    // Drafts route detection. We use Mithril's m.route.get() rather than
    // window.location because m.route.get() reflects Mithril's current
    // route regardless of how Flarum is mounted (history vs hash).
    function isDraftsRoute() {
        try {
            var route = (typeof m !== 'undefined' && m.route && m.route.get && m.route.get()) || '';
            if (typeof route !== 'string') return false;
            // Match /blog/drafts or /blog/drafts?... or /blog/drafts/...
            // Avoid matching /blog/drafts-something or /blog/draftsomething.
            return /^\/blog\/drafts(\/|\?|$)/.test(route);
        } catch (e) { return false; }
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
                    error: tr('forum.subscribe.subscribe_failed'),
                });
                try { alert(tr('forum.subscribe.subscribe_failed')); } catch (e) {}
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
                    error: tr('forum.subscribe.unsubscribe_failed'),
                });
                try { alert(tr('forum.subscribe.unsubscribe_failed')); } catch (e) {}
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
            sort:    opts.draftsOnly ? '-createdAt' : '-publishedAt',
            page:    { offset: opts.offset || 0, limit: opts.limit || 12 },
            include: 'user,category',
        };
        if (opts.categoryId) {
            params.categoryId = opts.categoryId;
        }
        if (opts.draftsOnly) {
            params.isPublished = 'false';
        }
        if (opts.userId) {
            params.userId = opts.userId;
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

    function slugify(s) {
        return String(s || '')
            .toLowerCase()
            .replace(/['"`]/g, '')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 200);
    }

    function insertAtCursor(textarea, before, after, placeholder) {
        if (!textarea) return;
        var start = textarea.selectionStart;
        var end   = textarea.selectionEnd;
        var value = textarea.value;
        var selected = value.slice(start, end) || (placeholder || '');
        var newValue = value.slice(0, start) + before + selected + after + value.slice(end);
        textarea.value = newValue;
        try {
            textarea.dispatchEvent(new Event('input', { bubbles: true }));
        } catch (e) {}
        var cursorStart = start + before.length;
        var cursorEnd   = cursorStart + selected.length;
        try {
            textarea.focus();
            textarea.setSelectionRange(cursorStart, cursorEnd);
        } catch (e) {}
    }

    function isFofUploadInstalled() {
        try {
            if (typeof flarum !== 'undefined' && flarum.extensions && flarum.extensions['fof-upload']) {
                return true;
            }
        } catch (e) {}
        try {
            if (app && app.data && app.data.extensions && app.data.extensions['fof-upload']) {
                return true;
            }
        } catch (e) {}
        return false;
    }

    function uploadFofFile(file, cb) {
        if (!file) { cb(null, tr('forum.edit_post.upload_no_file')); return; }
        var body = new FormData();
        body.append('files[]', file);
        app.request({
            method:    'POST',
            url:       app.forum.attribute('apiUrl') + '/fof/upload',
            serialize: function (raw) { return raw; },
            body:      body,
        })
        .then(function (resp) {
            var data = resp && resp.data;
            var uploaded = (data && data[0]) || null;
            var url = uploaded && uploaded.attributes && uploaded.attributes.url;
            if (url) cb(url, null);
            else cb(null, tr('forum.edit_post.upload_no_url'));
        })
        .catch(function (err) {
            console.error('[linkrobins/blog] upload failed:', err);
            var msg = tr('forum.edit_post.upload_failed');
            if (err && err.response && err.response.errors && err.response.errors[0]) {
                var e = err.response.errors[0];
                msg = e.detail || e.title || msg;
            } else if (err && err.status === 404) {
                msg = tr('forum.edit_post.upload_endpoint_missing_short');
            }
            cb(null, msg);
        });
    }

    function fetchCategoriesList() {
        return app.request({
            method: 'GET',
            url:    app.forum.attribute('apiUrl') + '/linkrobins-blog-categories',
            params: { sort: 'position', page: { limit: 100 } },
        });
    }

    function createBlogPost(attributes, categoryId) {
        var rels = {};
        if (categoryId) {
            rels.category = { data: { type: 'linkrobins-blog-categories', id: String(categoryId) } };
        }
        return app.request({
            method: 'POST',
            url:    app.forum.attribute('apiUrl') + '/linkrobins-blog-posts',
            body:   {
                data: {
                    type: 'linkrobins-blog-posts',
                    attributes: attributes,
                    relationships: rels,
                },
            },
        });
    }

    function updateBlogPost(id, attributes, categoryId, clearCategory) {
        var rels = {};
        if (categoryId) {
            rels.category = { data: { type: 'linkrobins-blog-categories', id: String(categoryId) } };
        } else if (clearCategory) {
            rels.category = { data: null };
        }
        var body = {
            data: {
                type: 'linkrobins-blog-posts',
                id:   String(id),
                attributes: attributes,
            },
        };
        if (Object.keys(rels).length) body.data.relationships = rels;
        return app.request({
            method: 'PATCH',
            url:    app.forum.attribute('apiUrl') + '/linkrobins-blog-posts/' + encodeURIComponent(id),
            body:   body,
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

    function canCreateBlogPost() {
        try {
            if (!app.session || !app.session.user) return false;
            if (typeof app.session.user.isAdmin === 'function' && app.session.user.isAdmin()) return true;
            return !!readForumAttribute('canCreateBlogPost');
        } catch (e) { return false; }
    }

    function canModerateBlogPosts() {
        try {
            if (!app.session || !app.session.user) return false;
            if (typeof app.session.user.isAdmin === 'function' && app.session.user.isAdmin()) return true;
            return !!readForumAttribute('canModerateBlogPosts');
        } catch (e) { return false; }
    }

    function canEditBlogPost(post) {
        if (canModerateBlogPosts()) return true;
        if (!canCreateBlogPost()) return false;
        try {
            if (!app.session || !app.session.user) return false;
            var rel = post && post.relationships && post.relationships.user && post.relationships.user.data;
            if (!rel) return false;
            return String(rel.id) === String(app.session.user.id());
        } catch (e) { return false; }
    }

    // Shared categories cache used by the post editor modal. We fetch once
    // and reuse across opens; categories rarely change and re-fetching on
    // every open feels sluggish.
    var _categoriesCache = null;
    var _categoriesLoading = false;
    var _categoriesWaiters = [];

    function loadCategoriesForEditor(cb) {
        if (_categoriesCache) { cb(_categoriesCache); return; }
        _categoriesWaiters.push(cb);
        if (_categoriesLoading) return;
        _categoriesLoading = true;
        fetchCategoriesList()
            .then(function (resp) {
                _categoriesCache = (resp && resp.data) || [];
                _categoriesLoading = false;
                var waiters = _categoriesWaiters.slice();
                _categoriesWaiters.length = 0;
                waiters.forEach(function (w) { try { w(_categoriesCache); } catch (e) {} });
            })
            .catch(function (err) {
                console.error('[linkrobins/blog] could not load categories:', err);
                _categoriesLoading = false;
                _categoriesCache = [];
                var waiters = _categoriesWaiters.slice();
                _categoriesWaiters.length = 0;
                waiters.forEach(function (w) { try { w(_categoriesCache); } catch (e) {} });
            });
    }

    function invalidateCategoriesCache() {
        _categoriesCache = null;
    }

    // Refresh-listener registry. Each mounted blog page (index or article)
    // registers itself on oninit and unregisters on onremove. When a post
    // save fires onSaved, we broadcast to every current listener -- which
    // re-runs its own _load() to repopulate state from the API.
    //
    // This is preferable to having the modal try to reach back into "the
    // current page", because the current page might be an index, a
    // category index, or an article -- and each one knows best how to
    // refresh itself.
    var _refreshListeners = [];

    function registerBlogRefreshListener(fn) {
        if (typeof fn !== 'function') return function () {};
        _refreshListeners.push(fn);
        return function unregister() {
            var i = _refreshListeners.indexOf(fn);
            if (i >= 0) _refreshListeners.splice(i, 1);
        };
    }

    // Wraps Flarum's alert manager in a way that's safe to call from any
    // delete/save handler. Auto-dismisses after a short delay so the user
    // doesn't have to click through.
    function showBlogAlert(type, message) {
        try {
            if (!app.alerts || typeof app.alerts.show !== 'function') return;
            var key = app.alerts.show({ type: type }, message);
            setTimeout(function () {
                try { app.alerts.dismiss(key); } catch (e) {}
            }, 4000);
        } catch (e) {}
    }

    function broadcastBlogRefresh(event) {
        // `event` is { type: 'save' | 'delete', postId?: string|number }.
        // Listeners can inspect it to behave differently for deletes
        // (e.g. an article page on the deleted post doesn't try to refetch
        // a 404'd resource).
        var ev = event || { type: 'save' };

        // Slice so listeners that unregister themselves during the call
        // (e.g. an article page navigating away on its own post deletion)
        // don't corrupt iteration.
        var current = _refreshListeners.slice();
        for (var i = 0; i < current.length; i++) {
            try { current[i](ev); } catch (e) {
                console.error('[linkrobins/blog] refresh listener failed:', e);
            }
        }
        try { m.redraw(); } catch (e) {}

        // User-facing confirmation. We toast at the broadcast site rather
        // than from each listener so the message fires regardless of which
        // blog view is mounted (or none -- e.g. deletion of a post while
        // on /some-other-page).
        if (ev.type === 'delete') {
            showBlogAlert('success', tr('forum.post.delete_success'));
        } else if (ev.type === 'save') {
            // Saves are usually followed by the modal closing on a
            // visible blog list/article -- no toast needed, the UI
            // changes are their own feedback.
        }
    }

    // Opens the post editor modal. `post` is the raw JSON:API resource
    // (or null for a new post). `onSaved` is a callback that fires after
    // save or delete -- pages typically use this to refresh their data.
    function openPostEditor(post, onSaved) {
        if (!window.LinkRobinsBlogPostEditorModal) {
            try { alert(tr('forum.edit_post.editor_not_available')); } catch (e) {}
            return;
        }
        loadCategoriesForEditor(function (categories) {
            try {
                app.modal.show(window.LinkRobinsBlogPostEditorModal, {
                    post:       post,
                    categories: categories,
                    onSaved:    function () {
                        broadcastBlogRefresh({ type: 'save' });
                        if (typeof onSaved === 'function') {
                            try { onSaved(); } catch (e) {}
                        }
                    },
                    onDeleted:  function (postId) {
                        broadcastBlogRefresh({ type: 'delete', postId: postId });
                        if (typeof onSaved === 'function') {
                            try { onSaved(); } catch (e) {}
                        }
                    },
                });
            } catch (err) {
                console.error('[linkrobins/blog] could not open editor:', err);
            }
        });
    }

    function init() {
        var Page         = null;
        var LinkButton   = null;
        var Button       = null;
        var LoadingIndicator = null;
        var PageStructure = null;
        var IndexSidebar  = null;
        var Modal         = null;
        try { Page             = flarum.reg.get('core', 'common/components/Page'); }             catch (e) {}
        try { LinkButton       = flarum.reg.get('core', 'common/components/LinkButton'); }       catch (e) {}
        try { Button           = flarum.reg.get('core', 'common/components/Button'); }           catch (e) {}
        try { LoadingIndicator = flarum.reg.get('core', 'common/components/LoadingIndicator'); } catch (e) {}
        try { PageStructure    = flarum.reg.get('core', 'forum/components/PageStructure'); }     catch (e) {}
        try { IndexSidebar     = flarum.reg.get('core', 'forum/components/IndexSidebar'); }      catch (e) {}
        try { Modal            = flarum.reg.get('core', 'common/components/Modal'); }            catch (e) {}

        if (!Page) {
            console.error('[linkrobins/blog] Page component not available; aborting.');
            return;
        }

        // The post editor modal is built on Flarum's Modal class so it lives
        // inside init() rather than at module scope. Stash it on a closure
        // variable that the sidebar/article code reaches into via the
        // openPostEditor() helper below.
        var PostEditorModal = Modal ? makePostEditorModal(Modal) : null;
        window.LinkRobinsBlogPostEditorModal = PostEditorModal;

        var BlogIndexSidebar = IndexSidebar ? makeBlogIndexSidebar(IndexSidebar, LinkButton, Button) : null;
        var BlogIndexPage    = makeBlogIndexPage(Page, LoadingIndicator, PageStructure, LinkButton, BlogIndexSidebar);
        var BlogPostPage     = makeBlogPostPage(Page, LoadingIndicator, PageStructure, LinkButton, BlogIndexSidebar);

        app.routes['linkrobins-blog.index']    = { path: '/' + BLOG_SLUG,                          component: BlogIndexPage };
        app.routes['linkrobins-blog.category'] = { path: '/category/:slug',                       component: BlogIndexPage };
        app.routes['linkrobins-blog.drafts']   = {
            path: '/' + BLOG_SLUG + '/drafts',
            component: BlogIndexPage,
            // Mithril doesn't accept extra static attrs on route entries
            // directly, so we read app.route.param() or detect the
            // pathname inside the page. The page sniffs window.location
            // to know when it's the drafts route.
        };
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
                    // Skip when the current page is itself a blog page. The
                    // BlogIndexSidebar subclass calls super.navItems(), which
                    // routes through this wrapper -- adding our own "Blog"
                    // link there would duplicate the BlogIndexSidebar's own
                    // "All Posts" link. The wrapper is only useful from the
                    // *forum* IndexSidebar (e.g. when reading /all), where it
                    // gives users a shortcut over to the blog.
                    try {
                        var routeName = app.current && typeof app.current.get === 'function'
                            ? app.current.get('routeName')
                            : null;
                        if (typeof routeName === 'string' && routeName.indexOf('linkrobins-blog') === 0) {
                            return;
                        }
                    } catch (e) {}

                    // Whichever entry is the configured homepage takes the
                    // top slot in the SelectDropdown, on EVERY page. So:
                    //   - blog homepage: Blog at 100, demote allDiscussions to 90
                    //   - all-discussions homepage: Blog at 90, leave allDiscussions at 100
                    // This produces a stable nav: the user's chosen "home"
                    // is always first regardless of what they're currently
                    // viewing, matching how Flarum's defaultRoute is meant
                    // to be the primary destination.
                    var bp        = basePath();
                    var blogHome  = isBlogHomepage();
                    var href      = blogHome ? (bp + '/') : (bp + blogIndexRoute());

                    if (blogHome) {
                        items.add('linkrobins-blog',
                            m(LinkButton, { href: href, icon: navIcon() }, navLabel()),
                            100
                        );
                        // Push the core allDiscussions entry down a notch so
                        // the homepage (Blog) reads first. setPriority is a
                        // no-op if the key isn't present, but we guard
                        // anyway for old/future ItemList shapes.
                        try {
                            if (typeof items.has === 'function' && items.has('allDiscussions')
                                && typeof items.setPriority === 'function') {
                                items.setPriority('allDiscussions', 90);
                            }
                        } catch (e) {}
                    } else {
                        items.add('linkrobins-blog',
                            m(LinkButton, { href: href, icon: navIcon() }, navLabel()),
                            90
                        );
                    }
                });
            }
        } catch (e) {
            console.error('[linkrobins/blog] could not extend IndexSidebar nav:', e);
        }
    }

    function makePostEditorModal(Modal) {
        return class PostEditorModal extends Modal {
            static get isDismissibleViaBackdropClick() { return false; }

            oninit(vnode) {
                super.oninit(vnode);

                var post = this.attrs.post;
                var attr = post ? post.attributes : {};
                var cat  = post ? (post.relationships
                    && post.relationships.category
                    && post.relationships.category.data) : null;

                this.editId      = post ? post.id : null;
                this.titleText   = attr.title       || '';
                this.slug        = attr.slug        || '';
                this.excerpt     = attr.excerpt     || '';
                this.cover       = attr.coverImageUrl || '';
                this.coverCredit    = attr.coverImageCredit    || '';
                this.coverCreditUrl = attr.coverImageCreditUrl || '';
                this.bodyText    = attr.content     || '';
                this.visibility  = attr.visibility  || 'public';
                this.categoryId  = cat ? cat.id : '';
                this.isPublished = attr.isPublished === true;
                // commentsEnabled defaults to true for new posts and for existing posts where the field isn't set
                this.commentsEnabled = post ? (attr.commentsEnabled !== false) : true;
                this.saving      = false;
                this.error       = null;
                this.coverUploading   = false;
                this.coverUploadError = null;
                this.bodyUploading   = false;
                this.bodyUploadIndex = 0;
                this.bodyUploadTotal = 0;
                this.bodyUploadError = null;
                this._userEditedSlug = !!post;
            }

            className()  { return 'Modal--large LinkRobinsBlog-editorModal'; }
            title()      { return this.editId ? tr('forum.edit_post.title_edit') : tr('forum.edit_post.title_create'); }

            content() {
                var self = this;
                return m('div', { className: 'Modal-body LinkRobinsBlog-editor' }, [
                    self.error ? m('div', { className: 'Alert Alert--danger' }, [
                        m('span', { className: 'Alert-body' }, tr('forum.edit_post.save_failed', { detail: self._errorMessage() })),
                    ]) : null,
                    m('div', { className: 'Form-body' }, [
                        self._renderTitleAndSlug(),
                        self._renderExcerpt(),
                        self._renderCover(),
                        self._renderMeta(),
                        m('div', { className: 'LinkRobinsBlog-editor-bodyWrapper' }, [
                            self._renderToolbar(),
                            self._renderBody(),
                        ]),
                    ]),
                    self._renderActions(),
                ]);
            }

            _errorMessage() {
                var err = this.error;
                if (!err) return tr('forum.edit_post.unknown_error');
                try {
                    var errors = err.response && err.response.errors;
                    if (errors && errors[0]) {
                        var src = errors[0].source && (errors[0].source.pointer || errors[0].source.parameter);
                        return (errors[0].detail || errors[0].title || tr('forum.edit_post.error_label')) + (src ? ' (' + src + ')' : '');
                    }
                } catch (e) {}
                return (err.message || err.statusText || tr('forum.edit_post.unknown_error'));
            }

            _renderTitleAndSlug() {
                var self = this;
                return m('div', { className: 'Form-group' }, [
                    m('label', null, tr('forum.edit_post.title_label')),
                    m('input', {
                        type:       'text',
                        className:  'FormControl',
                        value:      self.titleText,
                        disabled:   self.saving,
                        placeholder: tr('forum.edit_post.title_placeholder'),
                        oninput:    function (e) {
                            self.titleText = e.target.value;
                            if (!self.editId) {
                                self.slug = slugify(self.titleText);
                            }
                        },
                    }),
                ]);
            }

            _renderExcerpt() {
                var self = this;
                return m('div', { className: 'Form-group' }, [
                    m('label', null, tr('forum.edit_post.excerpt_label') + ' ', m('span', { className: 'LinkRobinsBlog-editor-optional' }, tr('forum.edit_post.excerpt_optional'))),
                    m('textarea', {
                        className:  'FormControl',
                        value:      self.excerpt,
                        disabled:   self.saving,
                        rows:       2,
                        placeholder: tr('forum.edit_post.excerpt_placeholder'),
                        oninput:    function (e) { self.excerpt = e.target.value; },
                    }),
                ]);
            }

            _renderCover() {
                var self = this;
                var hasFofUpload = isFofUploadInstalled();
                return m('div', { className: 'Form-group LinkRobinsBlog-editor-coverGroup' }, [
                    m('label', null, tr('forum.edit_post.cover_label')),
                    m('div', { className: 'LinkRobinsBlog-editor-coverInputRow' }, [
                        m('input', {
                            type:        'text',
                            className:   'FormControl',
                            value:       self.cover,
                            disabled:    self.saving || self.coverUploading,
                            placeholder: tr('forum.edit_post.cover_url_placeholder'),
                            oninput:     function (e) { self.cover = e.target.value; },
                        }),
                        hasFofUpload ? m('button', {
                            type:      'button',
                            className: 'Button LinkRobinsBlog-editor-coverUploadBtn',
                            disabled:  self.saving || self.coverUploading,
                            onclick:   function () { self._pickCoverFile(); },
                        }, [
                            self.coverUploading
                                ? m('i', { className: 'fas fa-spinner fa-spin LinkRobinsBlog-editor-coverUploadIcon' })
                                : m('i', { className: 'fas fa-upload LinkRobinsBlog-editor-coverUploadIcon' }),
                            ' ',
                            self.coverUploading ? tr('forum.edit_post.cover_uploading') : tr('forum.edit_post.cover_upload_button'),
                        ]) : null,
                        // Hidden file input the Upload button triggers.
                        hasFofUpload ? m('input', {
                            type:     'file',
                            accept:   'image/*',
                            style:    'display: none;',
                            oncreate: function (vnode) { self._coverFileInput = vnode.dom; },
                            onchange: function (e) {
                                var f = e.target && e.target.files && e.target.files[0];
                                if (f) self._uploadCover(f);
                                if (e.target) e.target.value = '';
                            },
                        }) : null,
                    ]),
                    !hasFofUpload ? m('div', { className: 'helpText' },
                        tr('forum.edit_post.cover_url_help')
                    ) : null,
                    self.coverUploadError ? m('div', { className: 'Alert Alert--danger', style: 'margin-top:8px' },
                        m('span', { className: 'Alert-body' }, self.coverUploadError)
                    ) : null,
                    self.cover ? m('div', { className: 'LinkRobinsBlog-editor-coverPreview' },
                        m('img', { src: self.cover, alt: '', onerror: function (e) { e.target.style.display = 'none'; } })
                    ) : null,
                    m('div', { className: 'Form-group LinkRobinsBlog-editor-coverCreditGroup' }, [
                        m('label', null, tr('forum.edit_post.cover_credit_label')),
                        m('textarea', {
                            className:   'FormControl',
                            rows:        2,
                            value:       self.coverCredit || '',
                            disabled:    self.saving,
                            placeholder: tr('forum.edit_post.cover_credit_placeholder'),
                            oninput:     function (e) { self.coverCredit = e.target.value; },
                        }),
                        m('div', { className: 'helpText' },
                            tr('forum.edit_post.cover_credit_help')
                        ),
                        m('label', { className: 'LinkRobinsBlog-editor-coverCreditUrlLabel' },
                            tr('forum.edit_post.cover_credit_url_label')
                        ),
                        m('input', {
                            type:        'url',
                            className:   'FormControl',
                            value:       self.coverCreditUrl || '',
                            disabled:    self.saving,
                            placeholder: tr('forum.edit_post.cover_credit_url_placeholder'),
                            oninput:     function (e) { self.coverCreditUrl = e.target.value; },
                        }),
                        m('div', { className: 'helpText' },
                            tr('forum.edit_post.cover_credit_url_help')
                        ),
                    ]),
                ]);
            }

            _pickCoverFile() {
                if (this._coverFileInput) this._coverFileInput.click();
            }

            _uploadCover(file) {
                var self = this;
                if (!file) return;
                self.coverUploading   = true;
                self.coverUploadError = null;
                m.redraw();

                var body = new FormData();
                body.append('files[]', file);

                app.request({
                    method:    'POST',
                    url:       app.forum.attribute('apiUrl') + '/fof/upload',
                    serialize: function (raw) { return raw; },
                    body:      body,
                })
                .then(function (resp) {
                    self.coverUploading = false;
                    var data = resp && resp.data;
                    var uploaded = (data && data[0]) || null;
                    var url = uploaded && uploaded.attributes && uploaded.attributes.url;
                    if (url) {
                        self.cover = url;
                    } else {
                        self.coverUploadError = tr('forum.edit_post.upload_no_url');
                    }
                    m.redraw();
                })
                .catch(function (err) {
                    self.coverUploading = false;
                    console.error('[linkrobins/blog] cover upload failed:', err);
                    var msg = tr('forum.edit_post.upload_failed');
                    if (err && err.response && err.response.errors && err.response.errors[0]) {
                        var e = err.response.errors[0];
                        msg = (e.detail || e.title || msg);
                    } else if (err && err.status === 404) {
                        msg = tr('forum.edit_post.upload_endpoint_missing');
                    }
                    self.coverUploadError = msg;
                    m.redraw();
                });
            }

            _renderMeta() {
                var self = this;
                return m('div', { className: 'LinkRobinsBlog-editor-row' }, [
                    m('div', { className: 'Form-group' }, [
                        m('label', null, tr('forum.edit_post.category_label')),
                        m('select', {
                            className: 'FormControl',
                            value:     self.categoryId,
                            disabled:  self.saving,
                            onchange:  function (e) { self.categoryId = e.target.value; },
                        }, [
                            m('option', { value: '' }, tr('forum.edit_post.category_none')),
                            (self.attrs.categories || []).map(function (cat) {
                                return m('option', { value: cat.id, key: 'c-' + cat.id }, cat.attributes.name);
                            }),
                        ]),
                    ]),
                    m('div', { className: 'Form-group' }, [
                        m('label', null, tr('forum.edit_post.visibility_label')),
                        m('select', {
                            className: 'FormControl',
                            value:     self.visibility,
                            disabled:  self.saving,
                            onchange:  function (e) { self.visibility = e.target.value; },
                        }, [
                            m('option', { value: 'public' }, tr('forum.edit_post.visibility_public')),
                            m('option', { value: 'members' }, tr('forum.edit_post.visibility_members')),
                        ]),
                    ]),
                    m('div', { className: 'Form-group LinkRobinsBlog-editor-commentsToggle' }, [
                        m('label', null, tr('forum.edit_post.comments_label')),
                        m('label', { className: 'LinkRobinsBlog-editor-commentsToggle-row' }, [
                            m('input', {
                                type:     'checkbox',
                                checked:  self.commentsEnabled !== false,
                                disabled: self.saving,
                                onchange: function (e) { self.commentsEnabled = !!e.target.checked; },
                            }),
                            m('span', null, ' ' + tr('forum.edit_post.comments_toggle')),
                        ]),
                    ]),
                ]);
            }

            _renderToolbar() {
                var self = this;
                var btns = [
                    { icon: 'fas fa-bold',           title: 'Bold',         apply: function (ta) { insertAtCursor(ta, '**', '**', 'bold text'); } },
                    { icon: 'fas fa-italic',         title: 'Italic',       apply: function (ta) { insertAtCursor(ta, '*',  '*',  'italic text'); } },
                    { icon: 'fas fa-heading',        title: 'Heading',      apply: function (ta) { insertAtCursor(ta, '\n## ', '', 'Heading'); } },
                    { icon: 'fas fa-link',           title: 'Link',         apply: function (ta) {
                        var url = '';
                        try { url = window.prompt('URL:', 'https://') || ''; } catch (e) {}
                        if (!url) return;
                        insertAtCursor(ta, '[', '](' + url + ')', 'link text');
                    } },
                    { icon: 'fas fa-image',          title: 'Image (URL)',  apply: function (ta) {
                        var url = '';
                        try { url = window.prompt('Image URL:', 'https://') || ''; } catch (e) {}
                        if (!url) return;
                        insertAtCursor(ta, '![', '](' + url + ')', 'alt text');
                    } },
                    { icon: 'fas fa-code',           title: 'Inline code',  apply: function (ta) { insertAtCursor(ta, '`',  '`', 'code'); } },
                    { icon: 'fas fa-file-code',      title: 'Code block',   apply: function (ta) { insertAtCursor(ta, '\n```\n', '\n```\n', 'code here'); } },
                    { icon: 'fas fa-eye-slash',      title: 'Spoiler',      apply: function (ta) { insertAtCursor(ta, '[spoiler]', '[/spoiler]', 'hidden text'); } },
                    { icon: 'fas fa-table',          title: 'Table',        apply: function (ta) {
                        insertAtCursor(ta, '\n| Column 1 | Column 2 | Column 3 |\n| --- | --- | --- |\n| Cell | Cell | Cell |\n| Cell | Cell | Cell |\n', '', '');
                    } },
                    { icon: 'fas fa-quote-right',    title: 'Quote',        apply: function (ta) { insertAtCursor(ta, '\n> ', '', 'quoted text'); } },
                    { icon: 'fas fa-list-ul',        title: 'Bulleted list',apply: function (ta) { insertAtCursor(ta, '\n- ', '',  'item'); } },
                    { icon: 'fas fa-list-ol',        title: 'Numbered list',apply: function (ta) { insertAtCursor(ta, '\n1. ', '', 'item'); } },
                ];

                var children = btns.map(function (b) {
                    return m('button', {
                        type:      'button',
                        className: 'LinkRobinsBlog-editor-toolbarBtn',
                        title:     b.title,
                        disabled:  self.saving,
                        onclick:   function () {
                            var ta = document.getElementById('LinkRobinsBlog-editor-body');
                            b.apply(ta);
                        },
                    }, m('i', { className: b.icon }));
                });

                if (isFofUploadInstalled()) {
                    children.push(m('span', { className: 'LinkRobinsBlog-editor-toolbarSep' }));
                    children.push(m('button', {
                        type:      'button',
                        className: 'LinkRobinsBlog-editor-toolbarBtn LinkRobinsBlog-editor-toolbarBtn--upload',
                        title:     tr('forum.edit_post.toolbar_image_title'),
                        disabled:  self.saving || self.bodyUploading,
                        onclick:   function () { self._pickBodyFiles(); },
                    }, [
                        self.bodyUploading
                            ? m('i', { className: 'fas fa-spinner fa-spin' })
                            : m('i', { className: 'fas fa-cloud-upload-alt' }),
                    ]));
                }

                return m('div', { className: 'LinkRobinsBlog-editor-toolbar' }, children);
            }

            _renderBody() {
                var self = this;
                var hasFofUpload = isFofUploadInstalled();
                return m('div', { className: 'LinkRobinsBlog-editor-bodyGroup' }, [
                    m('textarea', {
                        id:         'LinkRobinsBlog-editor-body',
                        className:  'FormControl LinkRobinsBlog-editor-bodyInput',
                        value:      self.bodyText,
                        disabled:   self.saving,
                        rows:       16,
                        placeholder: tr('forum.edit_post.body_placeholder'),
                        oninput:    function (e) { self.bodyText = e.target.value; },
                    }),
                    hasFofUpload ? m('input', {
                        type:     'file',
                        accept:   'image/*',
                        multiple: true,
                        style:    'display: none;',
                        oncreate: function (vnode) { self._bodyFileInput = vnode.dom; },
                        onchange: function (e) {
                            var files = e.target && e.target.files;
                            if (files && files.length) self._uploadBodyFiles(files);
                            if (e.target) e.target.value = '';
                        },
                    }) : null,
                    self.bodyUploading ? m('div', { className: 'LinkRobinsBlog-editor-bodyUploadStatus' }, [
                        m('i', { className: 'fas fa-spinner fa-spin' }),
                        ' ' + tr('forum.edit_post.body_upload_status', { index: self.bodyUploadIndex || 0, total: self.bodyUploadTotal || 0 }),
                    ]) : null,
                    self.bodyUploadError ? m('div', { className: 'Alert Alert--danger LinkRobinsBlog-editor-bodyUploadError' },
                        m('span', { className: 'Alert-body' }, self.bodyUploadError)
                    ) : null,
                ]);
            }

            _pickBodyFiles() {
                if (this._bodyFileInput) this._bodyFileInput.click();
            }

            _uploadBodyFiles(files) {
                var self = this;
                var list = Array.prototype.slice.call(files);
                if (!list.length) return;

                self.bodyUploading   = true;
                self.bodyUploadTotal = list.length;
                self.bodyUploadIndex = 0;
                self.bodyUploadError = null;
                m.redraw();

                var processNext = function (i) {
                    if (i >= list.length) {
                        self.bodyUploading   = false;
                        self.bodyUploadIndex = 0;
                        self.bodyUploadTotal = 0;
                        m.redraw();
                        return;
                    }
                    self.bodyUploadIndex = i + 1;
                    m.redraw();

                    var file = list[i];
                    var body = new FormData();
                    body.append('files[]', file);

                    app.request({
                        method:    'POST',
                        url:       app.forum.attribute('apiUrl') + '/fof/upload',
                        serialize: function (raw) { return raw; },
                        body:      body,
                    })
                    .then(function (resp) {
                        var data = resp && resp.data;
                        var uploaded = (data && data[0]) || null;
                        var url = uploaded && uploaded.attributes && uploaded.attributes.url;
                        var name = (uploaded && uploaded.attributes && (uploaded.attributes.baseName || uploaded.attributes.path)) || (file.name || 'image');
                        if (url) {
                            // Insert markdown image at end of body (newline-separated).
                            var ta = document.getElementById('LinkRobinsBlog-editor-body');
                            var snippet = '![' + name.replace(/[\[\]]/g, '') + '](' + url + ')';
                            if (ta && typeof ta.selectionStart === 'number') {
                                // Insert at cursor on first iteration; subsequent ones append after the inserted text.
                                var insertText = (ta.value && !/\n\n$/.test(ta.value) && ta.selectionStart === ta.value.length ? '\n\n' : '') + snippet + '\n\n';
                                var start = ta.selectionStart, end = ta.selectionEnd;
                                ta.value = ta.value.slice(0, start) + insertText + ta.value.slice(end);
                                var pos = start + insertText.length;
                                ta.selectionStart = ta.selectionEnd = pos;
                                self.bodyText = ta.value;
                            } else {
                                var sep = (self.bodyText && !/\n\n$/.test(self.bodyText)) ? '\n\n' : '';
                                self.bodyText = (self.bodyText || '') + sep + snippet + '\n\n';
                            }
                        }
                        processNext(i + 1);
                    })
                    .catch(function (err) {
                        console.error('[linkrobins/blog] body upload failed:', err);
                        var msg = tr('forum.edit_post.upload_failed');
                        if (err && err.response && err.response.errors && err.response.errors[0]) {
                            var e = err.response.errors[0];
                            msg = e.detail || e.title || msg;
                        } else if (err && err.status === 404) {
                            msg = tr('forum.edit_post.upload_endpoint_missing');
                        }
                        self.bodyUploading   = false;
                        self.bodyUploadError = msg + ' (' + (file.name || 'file') + ')';
                        self.bodyUploadIndex = 0;
                        self.bodyUploadTotal = 0;
                        m.redraw();
                    });
                };

                processNext(0);
            }

            _renderActions() {
                var self = this;
                var hasTitle = (self.titleText || '').trim() !== '';
                var hasBody  = (self.bodyText  || '').trim() !== '';
                var canSave  = hasTitle && hasBody && !self.saving;

                var children = [
                    m('div', { className: 'LinkRobinsBlog-editor-actions-primary' }, [
                        m('button', {
                            type:      'button',
                            className: 'Button Button--primary',
                            disabled:  !canSave,
                            onclick:   function () { self._save(true); },
                        }, self.saving
                            ? tr('forum.edit_post.saving')
                            : (self.editId
                                ? (self.isPublished ? tr('forum.edit_post.update_button') : tr('forum.edit_post.publish_button'))
                                : tr('forum.edit_post.publish_button'))),
                        m('button', {
                            type:      'button',
                            className: 'Button',
                            disabled:  !canSave,
                            onclick:   function () { self._save(false); },
                        }, self.saving ? tr('forum.edit_post.saving') : tr('forum.edit_post.save_draft_button')),
                        m('button', {
                            type:      'button',
                            className: 'Button Button--text',
                            disabled:  self.saving,
                            onclick:   function () { self.hide(); },
                        }, tr('forum.edit_post.cancel_button')),
                    ]),
                ];

                if (self.editId) {
                    children.push(
                        m('button', {
                            type:      'button',
                            className: 'Button Button--text LinkRobinsBlog-editor-deleteBtn',
                            disabled:  self.saving,
                            onclick:   function () {
                                if (!window.confirm(tr('forum.post.delete_confirm'))) return;
                                self.saving = true;
                                self.error  = null;
                                m.redraw();
                                deleteBlogPost(self.editId).then(function () {
                                    // Prefer onDeleted (specifically signals
                                    // the post is gone); fall back to
                                    // onSaved for callers that don't
                                    // differentiate.
                                    var deletedCb = self.attrs && self.attrs.onDeleted;
                                    var savedCb   = self.attrs && self.attrs.onSaved;
                                    if (typeof deletedCb === 'function') {
                                        try { deletedCb(self.editId); } catch (e) {}
                                    } else if (typeof savedCb === 'function') {
                                        try { savedCb(); } catch (e) {}
                                    }
                                    self.hide();
                                }).catch(function (err) {
                                    self.saving = false;
                                    self.error  = err;
                                    m.redraw();
                                });
                            },
                        }, tr('forum.edit_post.delete_button'))
                    );
                }

                return m('div', { className: 'LinkRobinsBlog-editor-actions' }, children);
            }

            _save(publishFlag) {
                var self = this;
                self.saving = true;
                self.error  = null;
                m.redraw();

                var attributes = {
                    title:               self.titleText.trim(),
                    slug:                self.slug.trim() || slugify(self.titleText),
                    excerpt:             self.excerpt || '',
                    content:             self.bodyText,
                    coverImageUrl:       self.cover || null,
                    coverImageCredit:    (self.coverCredit && self.coverCredit.trim()) || null,
                    coverImageCreditUrl: (self.coverCreditUrl && self.coverCreditUrl.trim()) || null,
                    visibility:          self.visibility,
                    isPublished:         publishFlag,
                    commentsEnabled:     self.commentsEnabled !== false,
                };
                if (publishFlag && !self.editId) {
                    attributes.publishedAt = new Date().toISOString();
                } else if (publishFlag && self.editId && !self.isPublished) {
                    attributes.publishedAt = new Date().toISOString();
                }

                var categoryId    = self.categoryId || null;
                var clearCategory = !categoryId;

                var promise = self.editId
                    ? updateBlogPost(self.editId, attributes, categoryId, clearCategory)
                    : createBlogPost(attributes, categoryId);

                promise
                    .then(function () {
                        self.saving = false;
                        if (typeof self.attrs.onSaved === 'function') self.attrs.onSaved();
                        self.hide();
                    })
                    .catch(function (err) {
                        self.saving = false;
                        self.error  = err;
                        console.error('[linkrobins/blog] save failed:', err);
                        m.redraw();
                    });
            }
        };
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

                // Compose button. Visible only to users who can author blog
                // posts (per linkrobins-blog.start permission, plus admins).
                // Sits beside Subscribe with higher priority so it renders
                // first.
                if (Button && canCreateBlogPost()) {
                    items.add(
                        'compose',
                        m(Button, {
                            icon:          'fas fa-pen',
                            className:     'Button Button--primary LinkRobinsBlog-composeButton',
                            itemClassName: 'App-primaryControl',
                            'aria-label':  tr('forum.index.compose_button'),
                            title:         tr('forum.edit_post.title_create'),
                            onclick:       function () {
                                openPostEditor(null, function () {
                                    // broadcastBlogRefresh already redraws;
                                    // invalidate the category cache in case
                                    // the user touched categories during
                                    // composition.
                                    invalidateCategoriesCache();
                                });
                            },
                        }, tr('forum.index.compose_button')),
                        110
                    );
                }

                // Newsletter subscribe button.
                if (Button) {
                    _newsletterInitState();
                    var loggedIn = !!(app.session && app.session.user);
                    var isSub    = !!_newsletter.subscribed;
                    var busy     = !!_newsletter.busy;

                    var icon, label, onclick, extraClass;
                    if (!loggedIn) {
                        icon       = 'far fa-star';
                        label      = tr('forum.subscribe.subscribe_button');
                        extraClass = '';
                        onclick    = openLogIn;
                    } else if (isSub) {
                        icon       = 'fas fa-star';
                        label      = busy ? tr('forum.subscribe.working_busy') : tr('forum.subscribe.subscribed_button');
                        extraClass = ' is-subscribed';
                        onclick    = function () {
                            if (_newsletter.busy) return;
                            var ok = false;
                            try {
                                ok = window.confirm(tr('forum.subscribe.unsubscribe_confirm'));
                            } catch (e) { ok = true; }
                            if (ok) _newsletterUnsubscribe();
                        };
                    } else {
                        icon       = 'far fa-star';
                        label      = busy ? tr('forum.subscribe.subscribing_busy') : tr('forum.subscribe.subscribe_button');
                        extraClass = '';
                        onclick    = _newsletterSubscribe;
                    }

                    items.add(
                        'subscribe',
                        m(Button, {
                            icon:          icon,
                            className:     'Button LinkRobinsBlog-subscribeButton' + extraClass,
                            itemClassName: 'LinkRobinsBlog-subscribeButton-item',
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
                // Start from the parent IndexSidebar's nav items list, which
                // gives us "All Discussions" plus whatever other extensions
                // contribute via extend(IndexSidebar.prototype, 'navItems').
                //
                // We then layer the blog's own items on top:
                //   - "All Posts" at the top
                //   - "Drafts" for authoring users
                //   - "Categories" section at the bottom
                //
                // Two cleanups happen here:
                //   1. flarum/tags adds a "Tags" link AND a long per-tag link
                //      list. We keep the "Tags" link (lets readers jump to
                //      /tags), but we set noTagsList=true in oninit so the
                //      tags extension skips the per-tag list. We also strip
                //      its orphan separator if it slipped through.
                //   2. Nothing else needs stripping here -- the redundant
                //      forum-side "Blog" link is suppressed at its source
                //      (the extend() wrapper above opts out on blog pages).
                var items;
                try {
                    items = super.navItems();
                } catch (e) {
                    console.warn('[linkrobins/blog] super.navItems() threw, falling back to empty:', e);
                    var ItemListCtor0 = null;
                    try { ItemListCtor0 = flarum.reg.get('core', 'common/utils/ItemList'); } catch (e2) {}
                    items = ItemListCtor0 ? new ItemListCtor0() : null;
                }
                if (!items || !LinkButton) return items;

                // Defense in depth: if noTagsList didn't take effect for some
                // reason, still strip the orphan separator the tags extension
                // would emit just before its (now-absent) tag list.
                try {
                    if (typeof items.has === 'function' && items.has('separator')
                        && typeof items.remove === 'function') {
                        items.remove('separator');
                    }
                } catch (e) {}

                var bp         = basePath();
                var blogHome   = isBlogHomepage();
                var allHref    = blogHome ? (bp + '/') : (bp + blogIndexRoute());
                var activeSlug = (this.attrs && this.attrs.activeCategorySlug) || null;
                var isPostView = !!(this.attrs && this.attrs.isPostPage);
                var onDrafts   = isDraftsRoute();
                var allActive  = !activeSlug && !isPostView && !onDrafts;

                // Homepage entry goes first on every page (matches the
                // ordering in the forum-side IndexSidebar). When blog is
                // the homepage, "All Posts" is at 100 and we push the
                // inherited "All Discussions" down to 90. When all-
                // discussions is the homepage, "All Posts" is at 90 and
                // the inherited "All Discussions" stays at its default 100.
                var allPostsPriority = blogHome ? 100 : 90;
                items.add(
                    'allPosts',
                    m(LinkButton, {
                        href:   allHref,
                        icon:   navIcon(),
                        active: allActive,
                    }, navLabel() || tr('forum.sidebar.all_posts')),
                    allPostsPriority
                );
                if (blogHome) {
                    try {
                        if (typeof items.has === 'function' && items.has('allDiscussions')
                            && typeof items.setPriority === 'function') {
                            items.setPriority('allDiscussions', 90);
                        }
                    } catch (e) {}
                }

                var cats = _allCategoriesCache || [];
                var showDrafts = canCreateBlogPost();

                if (showDrafts || cats.length) {
                    items.add(
                        'categoriesHeading',
                        m('h4', { className: 'LinkRobinsBlog-sidebar-sectionHeading' }, tr('forum.sidebar.categories_heading')),
                        -60
                    );
                }

                // Drafts sits as the first entry under the Categories
                // heading, styled like a category so it blends visually
                // with the rest. It keeps the eye-slash icon (drafts =
                // not visible) but uses the same category-link class as
                // the real categories, including the colored-icon
                // accent via --blog-cat-color (we pick a muted gray so
                // it reads as "system" rather than borrowing a real
                // category's brand color).
                if (showDrafts) {
                    var draftsHref   = bp + '/' + BLOG_SLUG + '/drafts';
                    var draftsActive = isDraftsRoute();
                    items.add(
                        'drafts',
                        m(LinkButton, {
                            href:      draftsHref,
                            icon:      'fas fa-file-alt',
                            active:    draftsActive,
                            className: 'LinkRobinsBlog-sidebar-categoryLink LinkRobinsBlog-sidebar-draftsLink',
                            style:     '--blog-cat-color: var(--muted-color)',
                            title:     tr('forum.sidebar.drafts_tooltip'),
                        }, tr('forum.sidebar.drafts')),
                        -61
                    );
                }

                if (cats.length) {
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
                            -62 - i
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
                this.mode        = isDraftsRoute() ? 'drafts' : 'index';

                try {
                    app.setTitle(this.mode === 'drafts' ? tr('forum.index.hero_drafts_title') : '');
                    app.setTitleCount(0);
                } catch (e) {}

                // Tell the tags extension to skip emitting its per-tag link
                // list in the sidebar -- we still want the "Tags" entry
                // pointing at /tags, but not the long list of tag links,
                // because this is a blog page and the blog has its own
                // categories. flarum/tags reads this flag at navItems()
                // render time. See addTagList.js in the tags extension.
                try {
                    if (app.current && typeof app.current.set === 'function') {
                        app.current.set('noTagsList', true);
                    }
                } catch (e) {}

                this._currentSlug = this.attrs && this.attrs.slug || null;
                this._load();
                loadAllCategories().then(function () { try { m.redraw(); } catch (e) {} });

                var self = this;
                this._refreshUnregister = registerBlogRefreshListener(function (ev) {
                    // Save and delete both warrant a refetch of the index.
                    // We ignore ev.type here -- whichever happened, the
                    // list is now stale.
                    self.loading  = true;
                    self.posts    = [];
                    self.included = [];
                    self.offset   = 0;
                    self.hasMore  = true;
                    self._load();
                });
            }

            onupdate(vnode) {
                if (super.onupdate) super.onupdate(vnode);
                var newSlug = this.attrs && this.attrs.slug || null;
                var newMode = isDraftsRoute() ? 'drafts' : 'index';
                if (newSlug !== this._currentSlug || newMode !== this.mode) {
                    this._currentSlug = newSlug;
                    this.mode    = newMode;
                    this.loading = true;
                    this.posts   = [];
                    this.included = [];
                    this.offset  = 0;
                    this.hasMore = true;
                    this.category = null;
                    try { app.setTitle(this.mode === 'drafts' ? tr('forum.index.hero_drafts_title') : ''); } catch (e) {}
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
                try { if (this._refreshUnregister) this._refreshUnregister(); } catch (e) {}
                try { if (super.onremove) super.onremove(vnode); } catch (e) {}
            }

            _load() {
                var self = this;
                var categoryId = null;
                var draftsOnly = self.mode === 'drafts';

                var run = function () {
                    fetchPosts({
                        offset:     0,
                        limit:      postsPerPage(),
                        categoryId: categoryId,
                        draftsOnly: draftsOnly,
                    })
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

                // Drafts route has no category slug to resolve; skip the
                // category lookup branch even if a stale slug somehow sat
                // on this.attrs.
                if (this._currentSlug && self.mode !== 'drafts') {
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
                var draftsOnly = self.mode === 'drafts';

                fetchPosts({
                    offset:     self.offset,
                    limit:      postsPerPage(),
                    categoryId: categoryId,
                    draftsOnly: draftsOnly,
                })
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
                        m('div', { className: 'LinkRobinsBlog-empty' }, tr('forum.index.render_failed'))
                    );
                }
            }

            _safeView() {
                var self = this;

                var content;
                if (self.loading) {
                    content = LoadingIndicator ? m(LoadingIndicator) : m('div', null, tr('forum.index.loading'));
                } else if (self.error) {
                    content = m('div', { className: 'LinkRobinsBlog-empty' },
                        self.mode === 'drafts'
                            ? tr('forum.index.drafts_load_failed')
                            : tr('forum.index.load_failed'));
                } else if (!self.posts.length) {
                    content = m('div', { className: 'LinkRobinsBlog-empty' },
                        self.mode === 'drafts'
                            ? tr('forum.index.empty_drafts')
                            : tr('forum.index.empty'));
                } else if (self.mode === 'drafts') {
                    // Drafts list: no featured treatment; render every entry
                    // as a card so the listing reads as a uniform queue.
                    content = [
                        m('div', { className: 'LinkRobinsBlog-grid LinkRobinsBlog-grid--drafts' },
                            self.posts.map(self._renderCard.bind(self))
                        ),
                        self._renderLoadMore(),
                    ];
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
                // header_mode = 'none' suppresses the title, branding, and
                // tagline on the BLOG HOMEPAGE only. Category and Drafts
                // pages keep their context-specific titles because those
                // tell the reader where they are, which is independent of
                // brand styling.
                var headerMode    = readForumAttribute('linkrobinsBlogHeaderMode') || 'text';
                var suppressBrand = (headerMode === 'none')
                    && this.mode !== 'drafts'
                    && !this.category;

                var tagline = this.category ? '' : siteTagline();
                var titleNode;
                if (this.mode === 'drafts') {
                    titleNode = m('h1', { className: 'LinkRobinsBlog-hero-title' }, tr('forum.index.hero_drafts_title'));
                } else if (this.category) {
                    titleNode = m('h1', { className: 'LinkRobinsBlog-hero-title' }, this.category.attributes.name);
                } else if (suppressBrand) {
                    titleNode = null;
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

                // When branding is suppressed AND there's no background to
                // show, collapse the hero entirely so we don't leave a
                // dead empty strip above the post grid.
                if (suppressBrand && bgMode === 'none') {
                    return null;
                }
                if (suppressBrand) {
                    heroClass += ' LinkRobinsBlog-hero--imageOnly';
                }

                // Determine the inner content. When branding is suppressed,
                // we still render the hero (for its background) but skip
                // the inner text block entirely.
                var taglineNode = null;
                if (!suppressBrand) {
                    if (this.mode === 'drafts') {
                        taglineNode = m('p', { className: 'LinkRobinsBlog-hero-tagline' },
                            tr('forum.index.hero_drafts_tagline'));
                    } else if (tagline) {
                        taglineNode = m('p', { className: 'LinkRobinsBlog-hero-tagline' }, tagline);
                    }
                }
                var categoryDescNode = (!suppressBrand && this.category && this.category.attributes.description)
                    ? m('p', { className: 'LinkRobinsBlog-hero-tagline' }, this.category.attributes.description)
                    : null;

                return m('header', { className: heroClass, style: bgStyle },
                    suppressBrand
                        ? null
                        : m('div', { className: 'container' },
                            m('div', { className: 'LinkRobinsBlog-hero-inner' }, [
                                titleNode,
                                taglineNode,
                                categoryDescNode,
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
                var isDraft = attr.isPublished === false;

                return m('a', {
                    href: path,
                    className: 'LinkRobinsBlog-card' + (isDraft ? ' LinkRobinsBlog-card--draft' : ''),
                    onclick: function (e) { safeNavigate(path, e); },
                    key: 'p-' + post.id,
                }, [
                    m('div', { className: 'LinkRobinsBlog-card-cover' + (cover ? ' has-cover' : ' no-cover') },
                        cover ? m('img', { src: cover, alt: '', loading: 'lazy' }) : null
                    ),
                    m('div', { className: 'LinkRobinsBlog-card-body' }, [
                        isDraft ? m('div', { className: 'LinkRobinsBlog-card-draftBadge' }, [
                            m('i', { className: 'fas fa-eye-slash' }), ' Draft'
                        ]) : null,
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
                              }, tr('forum.index.load_more'))
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

                // Same as BlogIndexPage: tell flarum/tags to skip the
                // per-tag list in the sidebar when on a blog article page.
                try {
                    if (app.current && typeof app.current.set === 'function') {
                        app.current.set('noTagsList', true);
                    }
                } catch (e) {}

                this._load();

                var self = this;
                this._refreshUnregister = registerBlogRefreshListener(function (ev) {
                    if (ev && ev.type === 'delete') {
                        // The broadcast itself toasts on delete. Article
                        // view stays put with stale data on screen; the
                        // post is gone, but the loaded view is harmless.
                        // (If we tried to navigate away, we'd hit the
                        // homepage-is-blog-index no-op problem.)
                        return;
                    }

                    // Save event: refresh in-place. The slug may have
                    // changed (if the author edited it), so we re-derive
                    // it from the current route attrs at refresh time.
                    var nextSlug = stripDatePrefix(self.attrs && self.attrs.slug || null);
                    if (nextSlug) {
                        self._currentSlug = nextSlug;
                        self.loading = true;
                        self.post    = null;
                        self.discussion = null;
                        self._load();
                    }
                });
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
                try { if (this._refreshUnregister) this._refreshUnregister(); } catch (e) {}
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
                try { alert(tr('forum.edit_post.editor_not_available')); } catch (e) {}
            }

            _deletePost() {
                var self = this;
                self.actionsMenuOpen = false;
                if (self.deletingPost) return;
                if (!self.post) return;

                var ok = false;
                try { ok = window.confirm(tr('forum.post.delete_confirm')); } catch (e) {}
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
                        try { alert(tr('forum.post.delete_failed')); } catch (e) {}
                        m.redraw();
                    });
            }

            view() {
                try {
                    return this._safeView();
                } catch (e) {
                    console.error('[linkrobins/blog] post view crashed:', e);
                    return m('div', { className: 'LinkRobinsBlog LinkRobinsBlog--post' },
                        m('div', { className: 'LinkRobinsBlog-empty' }, tr('forum.post.render_failed'))
                    );
                }
            }

            _safeView() {
                var self = this;
                var content;
                if (self.loading) {
                    content = LoadingIndicator ? m(LoadingIndicator) : m('div', null, tr('forum.index.loading'));
                } else if (self.error || !self.post) {
                    content = m('div', { className: 'LinkRobinsBlog-empty' }, tr('forum.post.not_found'));
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
                                self._renderManageMenu(),
                            ]),
                            cover ? m('div', { className: 'LinkRobinsBlog-post-cover' }, [
                                m('img', { src: cover, alt: attr.title }),
                                (attr.coverImageCredit && String(attr.coverImageCredit).trim() !== '')
                                    ? m('div', { className: 'LinkRobinsBlog-post-coverCredit' },
                                        (attr.coverImageCreditUrl && /^https?:\/\//i.test(String(attr.coverImageCreditUrl)))
                                            ? m('a', {
                                                href:   String(attr.coverImageCreditUrl),
                                                target: '_blank',
                                                rel:    'noopener noreferrer',
                                            }, String(attr.coverImageCredit))
                                            : String(attr.coverImageCredit))
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
                        title:     tr('forum.post.manage_menu_button'),
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
                        }, [m('i', { className: 'fas fa-pencil-alt' }), ' ' + tr('forum.post.manage_edit_post')]) : null,
                        attr.canDelete ? m('button', {
                            type:      'button',
                            className: 'LinkRobinsBlog-post-actions-item LinkRobinsBlog-post-actions-item--danger',
                            disabled:  self.deletingPost,
                            onclick:   function () { self._deletePost(); },
                        }, [m('i', { className: 'fas fa-trash' }), ' ', self.deletingPost ? tr('forum.post.deleting') : tr('forum.post.manage_delete_post')]) : null,
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

            _renderManageMenu() {
                var self = this;
                if (!self.post) return null;
                if (!canEditBlogPost(self.post)) return null;

                if (self._manageMenuOpen === undefined) self._manageMenuOpen = false;

                // Toggle wiring uses a one-shot document listener installed
                // on open so a click anywhere outside the menu collapses it.
                function setOpen(next) {
                    self._manageMenuOpen = next;
                    if (next) {
                        var handler = function (ev) {
                            try {
                                if (ev && ev.target && ev.target.closest
                                        && ev.target.closest('.LinkRobinsBlog-manageMenu')) {
                                    return;
                                }
                            } catch (e) {}
                            self._manageMenuOpen = false;
                            document.removeEventListener('click', handler, true);
                            try { m.redraw(); } catch (e) {}
                        };
                        setTimeout(function () {
                            document.addEventListener('click', handler, true);
                        }, 0);
                    }
                    try { m.redraw(); } catch (e) {}
                }

                var items = [];
                items.push(m('button', {
                    type:      'button',
                    className: 'LinkRobinsBlog-manageMenu-item',
                    onclick:   function () {
                        setOpen(false);
                        openPostEditor(self.post, null);
                    },
                }, [m('i', { className: 'fas fa-pencil-alt' }), ' ' + tr('forum.post.manage_edit_post')]));

                items.push(m('button', {
                    type:      'button',
                    className: 'LinkRobinsBlog-manageMenu-item LinkRobinsBlog-manageMenu-item--danger',
                    onclick:   function () {
                        setOpen(false);
                        var attr = self.post.attributes || {};
                        var ok = false;
                        try { ok = window.confirm(tr('forum.edit_post.delete_confirm', { title: attr.title || tr('forum.post.this_post') })); } catch (e) {}
                        if (!ok) return;
                        var deletedId = self.post.id;
                        deleteBlogPost(deletedId)
                            .then(function () {
                                // Broadcast carries the delete event; the
                                // article page's own listener handles the
                                // success toast. We don't try to navigate
                                // away because the index route may equal
                                // the current path (when blog is the site
                                // homepage), making m.route.set a no-op.
                                broadcastBlogRefresh({ type: 'delete', postId: deletedId });
                            })
                            .catch(function (err) {
                                console.error('[linkrobins/blog] delete failed:', err);
                                showBlogAlert('error', tr('forum.post.delete_failed'));
                            });
                    },
                }, [m('i', { className: 'fas fa-trash' }), ' ' + tr('forum.post.manage_delete_post')]));

                return m('div', {
                    className: 'LinkRobinsBlog-manageMenu' + (self._manageMenuOpen ? ' is-open' : ''),
                }, [
                    m('button', {
                        type:      'button',
                        className: 'Button Button--default Button--more LinkRobinsBlog-manageMenu-trigger',
                        'aria-haspopup': 'menu',
                        'aria-expanded': self._manageMenuOpen ? 'true' : 'false',
                        'aria-label': tr('forum.post.manage_post_aria'),
                        title:     tr('forum.post.manage_post_aria'),
                        onclick:   function (ev) {
                            ev.stopPropagation();
                            setOpen(!self._manageMenuOpen);
                        },
                    }, m('i', { className: 'icon fas fa-ellipsis-h' })),
                    self._manageMenuOpen
                        ? m('div', { className: 'LinkRobinsBlog-manageMenu-popover', role: 'menu' }, items)
                        : null,
                ]);
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
                        m('h3', { className: 'LinkRobinsBlog-memberWall-title' }, tr('forum.post.members_only_heading')),
                        m('p',  { className: 'LinkRobinsBlog-memberWall-text' },
                            loggedIn
                                ? tr('forum.post.members_only_text_member')
                                : tr('forum.post.log_in_or_sign_up')),
                        loggedIn ? null : m('button', {
                            type:      'button',
                            className: 'Button Button--primary LinkRobinsBlog-memberWall-button',
                            onclick:   openLogIn,
                        }, tr('forum.post.log_in_continue')),
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

                var countLabel = count === 0 ? tr('forum.post.comments_count_none')
                               : count === 1 ? tr('forum.post.comments_count_one')
                               : tr('forum.post.comments_count_many', { count: count });

                var actionLabel = count === 0 ? tr('forum.post.comments_start')
                                              : tr('forum.post.comments_load_more');

                var body;
                if (commentsDisabled) {
                    body = m('div', { className: 'LinkRobinsBlog-comments-disabledNote' }, [
                        m('i', { className: 'fas fa-comment-slash' }),
                        ' ' + tr('forum.post.comments_locked'),
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
                    body = m('div', { className: 'LinkRobinsBlog-comments-loading' }, tr('forum.index.loading'));
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
                    m('h3', { className: 'LinkRobinsBlog-related-heading' }, tr('forum.post.read_more_heading')),
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
