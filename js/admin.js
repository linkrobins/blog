'use strict';

(function () {

    function slugify(s) {
        return String(s || '')
            .toLowerCase()
            .replace(/['"`]/g, '')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 200);
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

    // Upload a single File via the fof/upload endpoint. Calls cb(url, errMsg).
    // url is the file's public URL on success; errMsg is a human-readable string on failure.
    function uploadFofFile(file, cb) {
        if (!file) { cb(null, 'No file.'); return; }
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
            else cb(null, 'Upload succeeded but no URL returned.');
        })
        .catch(function (err) {
            console.error('[linkrobins/blog] upload failed:', err);
            var msg = 'Upload failed.';
            if (err && err.response && err.response.errors && err.response.errors[0]) {
                var e = err.response.errors[0];
                msg = e.detail || e.title || msg;
            } else if (err && err.status === 404) {
                msg = 'Upload endpoint not found. Is fof/upload installed and enabled?';
            }
            cb(null, msg);
        });
    }

    function formatDate(iso) {
        if (!iso) return '';
        try {
            var d = new Date(iso);
            if (isNaN(d.getTime())) return '';
            return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
        } catch (e) { return ''; }
    }

    function findIncluded(included, type, id) {
        if (!included || !id) return null;
        for (var i = 0; i < included.length; i++) {
            if (included[i].type === type && String(included[i].id) === String(id)) return included[i];
        }
        return null;
    }

    function relatedCategory(post, included) {
        var rel = post.relationships && post.relationships.category && post.relationships.category.data;
        if (!rel) return null;
        return findIncluded(included, 'linkrobins-blog-categories', rel.id);
    }

    function relatedUser(post, included) {
        var rel = post.relationships && post.relationships.user && post.relationships.user.data;
        if (!rel) return null;
        return findIncluded(included, 'users', rel.id);
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

    function init() {
        var ExtensionPage = null;
        var Modal         = null;
        var Button        = null;
        var LoadingIndicator = null;
        try { ExtensionPage    = flarum.reg.get('core', 'admin/components/ExtensionPage'); } catch (e) {}
        try { Modal            = flarum.reg.get('core', 'common/components/Modal'); }       catch (e) {}
        try { Button           = flarum.reg.get('core', 'common/components/Button'); }      catch (e) {}
        try { LoadingIndicator = flarum.reg.get('core', 'common/components/LoadingIndicator'); } catch (e) {}

        if (!ExtensionPage) {
            console.error('[linkrobins/blog] ExtensionPage not available.');
            return;
        }

        var BlogAdminPage = makeBlogAdminPage(ExtensionPage, LoadingIndicator);
        var PostEditorModal     = Modal ? makePostEditorModal(Modal) : null;
        var CategoryEditorModal = Modal ? makeCategoryEditorModal(Modal) : null;

        if (!app.registry || typeof app.registry.for !== 'function') {
            console.warn('[linkrobins/blog] app.registry not available');
            return;
        }

        app.registry
            .for('linkrobins-blog')
            .registerPage(BlogAdminPage);

        window.LinkRobinsBlogPostEditorModal     = PostEditorModal;
        window.LinkRobinsBlogCategoryEditorModal = CategoryEditorModal;

        // Add Blog as a homepage option in admin → Basics → Home page
        try {
            var BasicsPage = flarum.reg.get('core', 'admin/components/BasicsPage');
            var extMod     = flarum.reg.get('core', 'common/extend');
            var extend     = extMod && extMod.extend;
            if (BasicsPage && typeof extend === 'function') {
                extend(BasicsPage, 'homePageItems', function (items) {
                    items.add('linkrobins-blog', {
                        path:  '/blog',
                        label: 'Blog (Link Robins Blog)',
                    }, 90);
                });
            }
        } catch (e) {
            console.warn('[linkrobins/blog] could not extend BasicsPage:', e);
        }
    }

    function fetchPostsList(params) {
        return app.request({
            method: 'GET',
            url:    app.forum.attribute('apiUrl') + '/linkrobins-blog-posts',
            params: Object.assign({
                sort:    '-publishedAt',
                page:    { limit: 100 },
                include: 'user,category',
            }, params || {}),
        });
    }

    function fetchCategoriesList() {
        return app.request({
            method: 'GET',
            url:    app.forum.attribute('apiUrl') + '/linkrobins-blog-categories',
            params: { sort: 'position', page: { limit: 100 } },
        });
    }

    function createBlogCategory(attributes) {
        return app.request({
            method: 'POST',
            url:    app.forum.attribute('apiUrl') + '/linkrobins-blog-categories',
            body:   { data: { type: 'linkrobins-blog-categories', attributes: attributes } },
        });
    }

    function updateBlogCategory(id, attributes) {
        return app.request({
            method: 'PATCH',
            url:    app.forum.attribute('apiUrl') + '/linkrobins-blog-categories/' + encodeURIComponent(id),
            body:   { data: { type: 'linkrobins-blog-categories', id: String(id), attributes: attributes } },
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

    function deleteBlogPost(id) {
        return app.request({
            method: 'DELETE',
            url:    app.forum.attribute('apiUrl') + '/linkrobins-blog-posts/' + encodeURIComponent(id),
        });
    }

    function makeBlogAdminPage(ExtensionPage, LoadingIndicator) {
        return class BlogAdminPage extends ExtensionPage {
            oninit(vnode) {
                super.oninit(vnode);
                this.tab          = 'posts';
                this.loading      = true;
                this.posts        = [];
                this.categories   = [];
                this.included     = [];
                this.error        = null;
                this._loadData();
            }

            _loadData() {
                var self = this;
                self.loading = true;
                m.redraw();

                Promise.all([fetchPostsList(), fetchCategoriesList()])
                    .then(function (results) {
                        var postsResp     = results[0];
                        var categoriesResp = results[1];
                        self.posts      = (postsResp && postsResp.data) || [];
                        self.included   = (postsResp && postsResp.included) || [];
                        self.categories = (categoriesResp && categoriesResp.data) || [];
                        self.loading    = false;
                        m.redraw();
                    })
                    .catch(function (err) {
                        self.error   = err;
                        self.loading = false;
                        console.error('[linkrobins/blog] admin load failed:', err);
                        m.redraw();
                    });
            }

            content() {
                return m('div', { className: 'container LinkRobinsBlog-admin' }, [
                    this._renderTabs(),
                    this._renderTabContent(),
                ]);
            }

            _renderTabs() {
                var self = this;
                var tabs = [
                    { id: 'posts',       label: 'Posts',       icon: 'fas fa-feather-alt' },
                    { id: 'categories',  label: 'Categories',  icon: 'fas fa-folder' },
                    { id: 'subscribers', label: 'Subscribers', icon: 'fas fa-envelope' },
                    { id: 'settings',    label: 'Settings',    icon: 'fas fa-sliders-h' },
                ];
                return m('div', { className: 'LinkRobinsBlog-admin-tabs' },
                    tabs.map(function (t) {
                        return m('button', {
                            type:      'button',
                            className: 'LinkRobinsBlog-admin-tab'
                                + (self.tab === t.id ? ' is-active' : '')
                                + (t.disabled ? ' is-disabled' : ''),
                            title:     t.hint || '',
                            disabled:  t.disabled,
                            onclick:   function () { if (!t.disabled) { self.tab = t.id; } },
                        }, [
                            m('i', { className: t.icon }),
                            ' ',
                            t.label,
                            t.disabled ? m('span', { className: 'LinkRobinsBlog-admin-tab-hint' }, ' · soon') : null,
                        ]);
                    })
                );
            }

            _renderTabContent() {
                if (this.tab === 'posts')       return this._renderPostsTab();
                if (this.tab === 'categories')  return this._renderCategoriesTab();
                if (this.tab === 'subscribers') return this._renderSubscribersTab();
                if (this.tab === 'settings')    return this._renderSettingsTab();
                return m('div', { className: 'LinkRobinsBlog-admin-empty' }, 'Coming soon.');
            }

            _renderPostsTab() {
                var self = this;
                if (self.loading) {
                    return m('div', { className: 'LinkRobinsBlog-admin-loading' },
                        LoadingIndicator ? m(LoadingIndicator) : 'Loading...');
                }
                if (self.error) {
                    return m('div', { className: 'LinkRobinsBlog-admin-empty' }, 'Could not load posts.');
                }

                return m('div', { className: 'LinkRobinsBlog-admin-posts' }, [
                    m('div', { className: 'LinkRobinsBlog-admin-postsHeader' }, [
                        m('h3', null, 'All posts (' + self.posts.length + ')'),
                        m('button', {
                            type:      'button',
                            className: 'Button Button--primary',
                            onclick:   function () { self._openEditor(null); },
                        }, [m('i', { className: 'fas fa-plus' }), ' New post']),
                    ]),
                    self.posts.length === 0
                        ? m('div', { className: 'LinkRobinsBlog-admin-empty' }, 'No posts yet. Click "New post" to write your first one.')
                        : self._renderPostsTable(),
                ]);
            }

            _renderPostsTable() {
                var self = this;
                return m('table', { className: 'LinkRobinsBlog-admin-postsTable' }, [
                    m('thead', null, m('tr', null, [
                        m('th', null, 'Title'),
                        m('th', null, 'Status'),
                        m('th', null, 'Category'),
                        m('th', null, 'Date'),
                        m('th', { style: 'width: 1%; white-space: nowrap;' }, 'Actions'),
                    ])),
                    m('tbody', null, self.posts.map(function (post) {
                        var attr = post.attributes;
                        var cat  = relatedCategory(post, self.included);
                        return m('tr', { key: 'p-' + post.id }, [
                            m('td', null, [
                                m('strong', null, attr.title),
                                attr.excerpt ? m('div', { className: 'LinkRobinsBlog-admin-postsTable-excerpt' }, attr.excerpt) : null,
                            ]),
                            m('td', null, attr.isPublished
                                ? m('span', { className: 'LinkRobinsBlog-admin-badge LinkRobinsBlog-admin-badge--published' }, 'Published')
                                : m('span', { className: 'LinkRobinsBlog-admin-badge LinkRobinsBlog-admin-badge--draft' }, 'Draft')),
                            m('td', null, cat ? cat.attributes.name : '—'),
                            m('td', null, formatDate(attr.publishedAt || attr.createdAt) || '—'),
                            m('td', { style: 'white-space: nowrap;' }, [
                                m('button', {
                                    type:      'button',
                                    className: 'Button Button--text LinkRobinsBlog-admin-rowAction',
                                    onclick:   function () { self._openEditor(post); },
                                }, [m('i', { className: 'fas fa-pencil-alt' }), ' Edit']),
                                ' ',
                                m('button', {
                                    type:      'button',
                                    className: 'Button Button--text LinkRobinsBlog-admin-rowAction LinkRobinsBlog-admin-rowAction--danger',
                                    onclick:   function () { self._deletePost(post); },
                                }, [m('i', { className: 'fas fa-trash' }), ' Delete']),
                            ]),
                        ]);
                    })),
                ]);
            }

            _renderCategoriesTab() {
                var self = this;
                if (self.loading) {
                    return m('div', { className: 'LinkRobinsBlog-admin-loading' },
                        LoadingIndicator ? m(LoadingIndicator) : 'Loading...');
                }
                if (self.error) {
                    return m('div', { className: 'LinkRobinsBlog-admin-empty' }, 'Could not load categories.');
                }

                return m('div', { className: 'LinkRobinsBlog-admin-categories' }, [
                    m('div', { className: 'LinkRobinsBlog-admin-postsHeader' }, [
                        m('h3', null, 'Categories (' + self.categories.length + ')'),
                        m('button', {
                            type:      'button',
                            className: 'Button Button--primary',
                            onclick:   function () { self._openCategoryEditor(null); },
                        }, [m('i', { className: 'fas fa-plus' }), ' New category']),
                    ]),

                    self.categories.length === 0
                        ? m('div', { className: 'LinkRobinsBlog-admin-empty' },
                            'No categories yet. Create one to organize blog posts.')
                        : self._renderCategoriesTable(),
                ]);
            }

            _renderCategoriesTable() {
                var self = this;
                var sorted = self.categories.slice().sort(function (a, b) {
                    var ap = (a.attributes && a.attributes.position) || 0;
                    var bp = (b.attributes && b.attributes.position) || 0;
                    if (ap !== bp) return ap - bp;
                    return String(a.attributes.name || '').localeCompare(String(b.attributes.name || ''));
                });

                return m('table', { className: 'LinkRobinsBlog-admin-postsTable LinkRobinsBlog-admin-categoriesTable' }, [
                    m('thead', null,
                        m('tr', null, [
                            m('th', null, '#'),
                            m('th', null, 'Name'),
                            m('th', null, 'Slug'),
                            m('th', null, 'Posts'),
                            m('th', { className: 'LinkRobinsBlog-admin-actionsCol' }, ''),
                        ])
                    ),
                    m('tbody', null, sorted.map(function (cat) { return self._renderCategoryRow(cat); })),
                ]);
            }

            _renderCategoryRow(cat) {
                var self = this;
                var attr = cat.attributes || {};
                var pos  = attr.position || 0;
                var color = attr.color || null;
                var icon  = attr.icon  || 'fas fa-folder';

                return m('tr', { key: 'cat-' + cat.id }, [
                    m('td', { className: 'LinkRobinsBlog-admin-categoryPosCell' }, pos),
                    m('td', null,
                        m('span', { className: 'LinkRobinsBlog-admin-categoryNameCell' }, [
                            m('span', {
                                className: 'LinkRobinsBlog-admin-categorySwatch',
                                style:     color ? ('background: ' + color) : 'background: rgba(127,127,127,0.2)',
                                'aria-hidden': 'true',
                            }, m('i', { className: icon + ' LinkRobinsBlog-admin-categorySwatch-icon' })),
                            m('span', { className: 'LinkRobinsBlog-admin-categoryName' }, attr.name),
                            attr.description ? m('span', { className: 'LinkRobinsBlog-admin-categoryDesc' }, attr.description) : null,
                        ])
                    ),
                    m('td', { className: 'LinkRobinsBlog-admin-categorySlugCell' }, m('code', null, attr.slug)),
                    m('td', null, typeof attr.postCount === 'number' ? attr.postCount : '—'),
                    m('td', { className: 'LinkRobinsBlog-admin-actionsCol' }, [
                        m('button', {
                            type:      'button',
                            className: 'Button Button--icon Button--link',
                            title:     'Edit',
                            onclick:   function () { self._openCategoryEditor(cat); },
                        }, m('i', { className: 'fas fa-pen' })),
                        m('button', {
                            type:      'button',
                            className: 'Button Button--icon Button--link',
                            title:     'Delete',
                            onclick:   function () { self._deleteCategory(cat); },
                        }, m('i', { className: 'fas fa-trash' })),
                    ]),
                ]);
            }

            _openCategoryEditor(cat) {
                var self = this;
                if (!window.LinkRobinsBlogCategoryEditorModal || !app.modal) return;
                app.modal.show(window.LinkRobinsBlogCategoryEditorModal, {
                    category: cat,
                    onSaved:  function () { self._loadData(); },
                });
            }

            _deleteCategory(cat) {
                var self = this;
                var attr = cat.attributes || {};
                var name = attr.name || ('category #' + cat.id);
                var count = typeof attr.postCount === 'number' ? attr.postCount : null;
                var warn = 'Delete the category "' + name + '"?';
                if (count && count > 0) {
                    warn += '\n\nThere ' + (count === 1 ? 'is 1 post' : 'are ' + count + ' posts')
                          + ' in this category. Those posts will keep their content but lose their category assignment.';
                }
                if (!window.confirm(warn)) return;

                app.request({
                    method: 'DELETE',
                    url:    app.forum.attribute('apiUrl') + '/linkrobins-blog-categories/' + cat.id,
                })
                .then(function () { self._loadData(); })
                .catch(function (err) {
                    console.error('[linkrobins/blog] delete category failed:', err);
                    try { alert('Could not delete the category.'); } catch (e) {}
                });
            }


            _renderSubscribersTab() {
                var self = this;

                if (this._subscriberCount === undefined && !this._subscriberLoading) {
                    this._loadSubscriberCount();
                }

                var apiBase = app.forum.attribute('apiUrl');
                var csvUrl  = apiBase + '/linkrobins-blog/subscribers?format=csv';

                return m('section', { className: 'LinkRobinsBlog-admin-subscribers' }, [
                    m('div', { className: 'LinkRobinsBlog-admin-subscribers-header' }, [
                        m('h2', null, 'Newsletter subscribers'),
                        m('p', { className: 'LinkRobinsBlog-admin-subscribers-blurb' },
                            'Users who have subscribed to your newsletter from the blog sidebar. '
                            + 'Download the list as CSV to broadcast from any mail tool, or use '
                            + 'the "Send newsletter" button on a post to broadcast via Flarum\u2019s SMTP.'),
                    ]),

                    m('div', { className: 'LinkRobinsBlog-admin-subscribers-stats' }, [
                        m('div', { className: 'LinkRobinsBlog-admin-subscribers-stat' }, [
                            m('div', { className: 'LinkRobinsBlog-admin-subscribers-statLabel' }, 'Subscribers'),
                            m('div', { className: 'LinkRobinsBlog-admin-subscribers-statValue' },
                                this._subscriberLoading
                                    ? '\u2026'
                                    : (typeof this._subscriberCount === 'number'
                                        ? this._subscriberCount.toLocaleString()
                                        : '—')
                            ),
                        ]),
                    ]),

                    this._subscriberError
                        ? m('div', { className: 'Alert Alert--danger' }, this._subscriberError)
                        : null,

                    m('div', { className: 'LinkRobinsBlog-admin-subscribers-actions' }, [
                        m('button', {
                            type:      'button',
                            className: 'Button',
                            disabled:  this._subscriberLoading,
                            onclick:   function () { self._loadSubscriberCount(); },
                        }, [m('i', { className: 'fas fa-sync' }), ' Refresh']),
                        m('a', {
                            href:      csvUrl,
                            className: 'Button Button--primary',
                        }, [m('i', { className: 'fas fa-download' }), ' Download CSV']),
                    ]),
                ]);
            }

            _loadSubscriberCount() {
                var self = this;
                self._subscriberLoading = true;
                self._subscriberError = null;
                m.redraw();
                app.request({
                    method: 'GET',
                    url:    app.forum.attribute('apiUrl') + '/linkrobins-blog/subscribers',
                })
                .then(function (resp) {
                    self._subscriberLoading = false;
                    self._subscriberCount = (resp && typeof resp.count === 'number') ? resp.count : 0;
                    m.redraw();
                })
                .catch(function (err) {
                    console.error('[linkrobins/blog] subscriber count failed:', err);
                    self._subscriberLoading = false;
                    self._subscriberError = 'Could not load subscriber count.';
                    m.redraw();
                });
            }

            _renderSettingsTab() {
                var self = this;

                var headerModeOptions = {
                    text: 'Text',
                    logo: 'Logo (from Flarum Appearance settings)',
                };

                var heroModeOptions = {
                    none:     'None (plain background)',
                    image:    'Background image',
                    gradient: "Theme gradient (primary → secondary)",
                };

                var fields = [
                    { section: 'Brand', items: [
                        { setting: 'linkrobins-blog.title',
                          type: 'text', label: 'Blog title',
                          help: 'Shown in the hero header when using a text-mode header. Leave blank to fall back to the forum title.',
                          placeholder: app.forum.attribute('title') || 'My Blog' },
                        { setting: 'linkrobins-blog.tagline',
                          type: 'text', label: 'Tagline',
                          help: 'Short description shown under the hero title.',
                          placeholder: 'Thoughts, projects, ramblings.' },
                    ] },

                    { section: 'Hero header', items: [
                        { setting: 'linkrobins-blog.header_mode',
                          type: 'select', label: 'Header style',
                          help: 'Choose how the blog name appears in the hero. Logo mode uses the logo from Flarum → Appearance → Basics.',
                          options: headerModeOptions, default: 'text' },
                        { setting: 'linkrobins-blog.hero_background_mode',
                          type: 'select', label: 'Hero background',
                          help: 'Add a background behind the hero. A darkening overlay keeps the text readable.',
                          options: heroModeOptions, default: 'none' },
                        function () {
                            // Custom renderer for hero background image URL with optional fof/upload picker.
                            var page = this;
                            var key  = 'linkrobins-blog.hero_background_url';
                            var current = page.setting(key)() || '';
                            var hasFofUpload = isFofUploadInstalled();

                            return m('div', { className: 'Form-group LinkRobinsBlog-settings-heroBgGroup' }, [
                                m('label', null, 'Hero background image'),
                                m('div', { className: 'LinkRobinsBlog-settings-heroBgInputRow' }, [
                                    m('input', {
                                        type:        'url',
                                        className:   'FormControl',
                                        value:       current,
                                        placeholder: 'https://example.com/cover.jpg',
                                        disabled:    page._heroBgUploading,
                                        oninput:     function (e) { page.setting(key)(e.target.value); },
                                    }),
                                    hasFofUpload ? m('button', {
                                        type:      'button',
                                        className: 'Button LinkRobinsBlog-settings-heroBgUploadBtn',
                                        disabled:  page._heroBgUploading,
                                        onclick:   function () {
                                            if (page._heroBgFileInput) page._heroBgFileInput.click();
                                        },
                                    }, [
                                        page._heroBgUploading
                                            ? m('i', { className: 'fas fa-spinner fa-spin' })
                                            : m('i', { className: 'fas fa-upload' }),
                                        ' ',
                                        page._heroBgUploading ? 'Uploading…' : 'Upload',
                                    ]) : null,
                                    hasFofUpload ? m('input', {
                                        type:     'file',
                                        accept:   'image/*',
                                        style:    'display: none;',
                                        oncreate: function (vnode) { page._heroBgFileInput = vnode.dom; },
                                        onchange: function (e) {
                                            var f = e.target && e.target.files && e.target.files[0];
                                            if (!f) return;
                                            uploadFofFile(f, function (url, err) {
                                                page._heroBgUploading = false;
                                                if (url) {
                                                    page.setting(key)(url);
                                                    page._heroBgError = null;
                                                } else {
                                                    page._heroBgError = err || 'Upload failed.';
                                                }
                                                m.redraw();
                                            });
                                            page._heroBgUploading = true;
                                            page._heroBgError = null;
                                            m.redraw();
                                            e.target.value = '';
                                        },
                                    }) : null,
                                ]),
                                m('div', { className: 'helpText' },
                                    hasFofUpload
                                        ? 'Used when "Background image" is selected above. Recommend at least 2000px wide. Upload or paste a URL.'
                                        : 'Used when "Background image" is selected above. Recommend at least 2000px wide. Install fof/upload to get a direct upload button.'
                                ),
                                page._heroBgError ? m('div', { className: 'Alert Alert--danger', style: 'margin-top:8px' },
                                    m('span', { className: 'Alert-body' }, page._heroBgError)
                                ) : null,
                                current ? m('div', { className: 'LinkRobinsBlog-settings-heroBgPreview' },
                                    m('img', { src: current, alt: '', onerror: function (e) { e.target.style.display = 'none'; } })
                                ) : null,
                            ]);
                        },
                        { setting: 'linkrobins-blog.hero_overlay',
                          type: 'number', label: 'Overlay darkness (0–90)',
                          help: 'How much to darken the background so the title is readable. 0 = no darkening, 90 = nearly black.',
                          min: 0, max: 90, default: '40' },
                    ] },

                    { section: 'Navigation', items: [
                        { setting: 'linkrobins-blog.nav_label',
                          type: 'text', label: 'Forum nav label',
                          help: 'Label for the "back to forum" link in the blog top navigation. Leave blank for "Forum".',
                          placeholder: 'Forum' },
                        { setting: 'linkrobins-blog.nav_icon',
                          type: 'text', label: 'Forum nav icon',
                          help: 'FontAwesome class for the forum link icon (e.g. fas fa-home, fas fa-comments).',
                          placeholder: 'fas fa-comments' },
                    ] },

                    { section: 'Layout', items: [
                        { setting: 'linkrobins-blog.posts_per_page',
                          type: 'number', label: 'Posts per page',
                          help: 'Number of posts shown on the blog index before "Load more".',
                          min: 1, max: 50, default: '12' },
                        { setting: 'linkrobins-blog.members_teaser_chars',
                          type: 'number', label: 'Members-only teaser length',
                          help: 'How many characters of a members-only post to show non-members before the login wall.',
                          min: 50, max: 5000, default: '500' },
                    ] },

                    { section: 'Custom HTML widget', items: [
                        { setting: 'linkrobins-blog.about_title',
                          type: 'text', label: 'Widget title',
                          help: 'Optional heading shown above the widget in the sidebar. Leave blank to skip the title.',
                          placeholder: 'e.g. About, Subscribe, Latest news' },
                        { setting: 'linkrobins-blog.about_html',
                          type: 'textarea', label: 'Widget content (HTML)',
                          help: 'Raw HTML shown in the sidebar on every blog page. Use it for an about blurb, a newsletter signup, social links, or anything else. Leave blank to hide the widget. Anything valid in HTML is fine here — your input is rendered as-is, so only admins should have access to this setting.',
                          rows: 5 },
                    ] },
                ];

                var sections = fields.map(function (group) {
                    return m('fieldset', { className: 'Form-group LinkRobinsBlog-settings-section' }, [
                        m('legend', null, group.section),
                        group.items.map(function (it) {
                            try {
                                return self.buildSettingComponent(it);
                            } catch (e) {
                                console.error('[linkrobins/blog] setting failed:', it, e);
                                return null;
                            }
                        }),
                    ]);
                });

                var changed = self.isChanged && self.isChanged();

                return m('form', {
                    className: 'Form LinkRobinsBlog-settings',
                    onsubmit:  function (e) {
                        e.preventDefault();
                        if (!self.saveSettings) return;
                        self.saveSettings(e).then(function () {
                            try { m.redraw(); } catch (_) {}
                        });
                    },
                }, [
                    m('div', { className: 'Form-body' }, sections),
                    m('div', { className: 'Form-group Form-controls LinkRobinsBlog-settings-actions' }, [
                        m('button', {
                            type:      'submit',
                            className: 'Button Button--primary'
                                + (!changed ? ' disabled' : '')
                                + (self.loading ? ' loading' : ''),
                            disabled:  !changed || self.loading,
                        }, self.loading ? 'Saving…' : 'Save Changes'),
                    ]),
                ]);
            }

            _openEditor(post) {
                var self = this;
                if (!window.LinkRobinsBlogPostEditorModal) {
                    alert('Post editor is not available.');
                    return;
                }
                app.modal.show(window.LinkRobinsBlogPostEditorModal, {
                    post:       post,
                    categories: self.categories,
                    onSaved:    function () { self._loadData(); },
                });
            }

            _deletePost(post) {
                var self = this;
                var ok = false;
                try { ok = window.confirm('Delete "' + post.attributes.title + '"? This cannot be undone.'); } catch (e) {}
                if (!ok) return;
                deleteBlogPost(post.id)
                    .then(function () { self._loadData(); })
                    .catch(function (err) {
                        console.error('[linkrobins/blog] delete failed:', err);
                        try { alert('Could not delete the post.'); } catch (e) {}
                    });
            }
        };
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
                this.coverCredit = attr.coverImageCredit || '';
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
            title()      { return this.editId ? 'Edit post' : 'New post'; }

            content() {
                var self = this;
                return m('div', { className: 'Modal-body LinkRobinsBlog-editor' }, [
                    self.error ? m('div', { className: 'Alert Alert--danger' }, [
                        m('span', { className: 'Alert-body' }, 'Could not save: ' + self._errorMessage()),
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
                        self._renderNewsletter(),
                    ]),
                    self._renderActions(),
                ]);
            }

            _renderNewsletter() {
                var self = this;
                if (!self.editId) return null;
                if (!self.isPublished) return null;

                var attr = (self.attrs.post && self.attrs.post.attributes) || {};
                var sentAt = attr.broadcastSentAt || null;
                var sending = !!self._newsletterSending;
                var status  = self._newsletterStatus;

                var label;
                if (sending) {
                    label = 'Sending…';
                } else if (sentAt) {
                    label = 'Re-send newsletter';
                } else {
                    label = 'Send newsletter';
                }

                return m('fieldset', { className: 'Form-group LinkRobinsBlog-editor-newsletter' }, [
                    m('legend', null, 'Newsletter'),
                    m('p', { className: 'helpText' },
                        sentAt
                            ? ('Already sent on ' + self._formatDate(sentAt) + '. '
                                + 'Re-sending will email every current subscriber again — use this only if the first send had a problem.')
                            : 'Email this post to every subscriber on the newsletter list. Uses Flarum\u2019s configured SMTP settings.'),
                    m('div', { className: 'LinkRobinsBlog-editor-newsletter-actions' }, [
                        m('button', {
                            type:      'button',
                            className: 'Button' + (sentAt ? '' : ' Button--primary'),
                            disabled:  sending,
                            onclick:   function () { self._sendNewsletter(!!sentAt); },
                        }, [m('i', { className: 'fas fa-paper-plane' }), ' ', label]),
                    ]),
                    status
                        ? m('div', {
                            className: 'Alert ' + (status.ok ? 'Alert--success' : 'Alert--danger'),
                            style: 'margin-top:10px;',
                          }, status.message)
                        : null,
                ]);
            }

            _formatDate(iso) {
                try {
                    var d = new Date(iso);
                    if (isNaN(d.getTime())) return iso;
                    return d.toLocaleString();
                } catch (e) { return iso; }
            }

            _sendNewsletter(isResend) {
                var self = this;

                var confirmMsg = isResend
                    ? 'Re-send the newsletter? Every current subscriber will be emailed again.'
                    : 'Send the newsletter for this post? Every subscriber will receive an email.';
                if (!window.confirm(confirmMsg)) return;

                self._newsletterSending = true;
                self._newsletterStatus = null;
                m.redraw();

                var url = app.forum.attribute('apiUrl')
                    + '/linkrobins-blog/posts/' + encodeURIComponent(self.editId) + '/broadcast'
                    + (isResend ? '?force=1' : '');

                app.request({ method: 'POST', url: url })
                    .then(function (resp) {
                        self._newsletterSending = false;
                        var sentAt = resp && resp.sent_at;
                        var count  = resp && resp.subscriber_count;
                        if (sentAt && self.attrs.post && self.attrs.post.attributes) {
                            self.attrs.post.attributes.broadcastSentAt = sentAt;
                        }
                        self._newsletterStatus = {
                            ok: true,
                            message: resp && resp.status === 'queued'
                                ? ('Queued for ' + count + ' subscriber'
                                    + (count === 1 ? '' : 's')
                                    + '. Emails will go out shortly.')
                                : ('Sent to ' + count + ' subscriber'
                                    + (count === 1 ? '' : 's') + '.'),
                        };
                        m.redraw();
                    })
                    .catch(function (err) {
                        self._newsletterSending = false;
                        var detail = '';
                        try {
                            detail = err && err.response && err.response.errors
                                && err.response.errors[0] && err.response.errors[0].detail;
                        } catch (e) {}
                        self._newsletterStatus = {
                            ok: false,
                            message: 'Could not send the newsletter' + (detail ? ': ' + detail : '.'),
                        };
                        console.error('[linkrobins/blog] broadcast failed:', err);
                        m.redraw();
                    });
            }

            _errorMessage() {
                var err = this.error;
                if (!err) return 'unknown error';
                try {
                    var errors = err.response && err.response.errors;
                    if (errors && errors[0]) {
                        var src = errors[0].source && (errors[0].source.pointer || errors[0].source.parameter);
                        return (errors[0].detail || errors[0].title || 'error') + (src ? ' (' + src + ')' : '');
                    }
                } catch (e) {}
                return (err.message || err.statusText || 'unknown error');
            }

            _renderTitleAndSlug() {
                var self = this;
                return m('div', { className: 'Form-group' }, [
                    m('label', null, 'Title'),
                    m('input', {
                        type:       'text',
                        className:  'FormControl',
                        value:      self.titleText,
                        disabled:   self.saving,
                        placeholder: 'e.g. Why I built this',
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
                    m('label', null, 'Excerpt ', m('span', { className: 'LinkRobinsBlog-editor-optional' }, '(optional)')),
                    m('textarea', {
                        className:  'FormControl',
                        value:      self.excerpt,
                        disabled:   self.saving,
                        rows:       2,
                        placeholder: 'Optional summary for cards. If empty, the first paragraph of the body is used.',
                        oninput:    function (e) { self.excerpt = e.target.value; },
                    }),
                ]);
            }

            _renderCover() {
                var self = this;
                var hasFofUpload = isFofUploadInstalled();
                return m('div', { className: 'Form-group LinkRobinsBlog-editor-coverGroup' }, [
                    m('label', null, 'Cover image'),
                    m('div', { className: 'LinkRobinsBlog-editor-coverInputRow' }, [
                        m('input', {
                            type:        'text',
                            className:   'FormControl',
                            value:       self.cover,
                            disabled:    self.saving || self.coverUploading,
                            placeholder: 'https://example.com/image.jpg',
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
                            self.coverUploading ? 'Uploading…' : 'Upload',
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
                        'Paste a URL above. Install fof/upload to get a direct upload button.'
                    ) : null,
                    self.coverUploadError ? m('div', { className: 'Alert Alert--danger', style: 'margin-top:8px' },
                        m('span', { className: 'Alert-body' }, self.coverUploadError)
                    ) : null,
                    self.cover ? m('div', { className: 'LinkRobinsBlog-editor-coverPreview' },
                        m('img', { src: self.cover, alt: '', onerror: function (e) { e.target.style.display = 'none'; } })
                    ) : null,
                    m('div', { className: 'Form-group LinkRobinsBlog-editor-coverCreditGroup' }, [
                        m('label', null, 'Image credit (optional)'),
                        m('input', {
                            type:        'text',
                            className:   'FormControl',
                            value:       self.coverCredit || '',
                            disabled:    self.saving,
                            placeholder: 'Photo by Jane Doe on Unsplash',
                            oninput:     function (e) { self.coverCredit = e.target.value; },
                        }),
                        m('div', { className: 'helpText' },
                            'Shown as a small caption under the cover image. Supports plain text or HTML.'
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
                        self.coverUploadError = 'Upload succeeded but no URL was returned.';
                    }
                    m.redraw();
                })
                .catch(function (err) {
                    self.coverUploading = false;
                    console.error('[linkrobins/blog] cover upload failed:', err);
                    var msg = 'Upload failed.';
                    if (err && err.response && err.response.errors && err.response.errors[0]) {
                        var e = err.response.errors[0];
                        msg = (e.detail || e.title || msg);
                    } else if (err && err.status === 404) {
                        msg = 'Upload endpoint not found. Is the fof/upload extension installed and enabled?';
                    }
                    self.coverUploadError = msg;
                    m.redraw();
                });
            }

            _renderMeta() {
                var self = this;
                return m('div', { className: 'LinkRobinsBlog-editor-row' }, [
                    m('div', { className: 'Form-group' }, [
                        m('label', null, 'Category'),
                        m('select', {
                            className: 'FormControl',
                            value:     self.categoryId,
                            disabled:  self.saving,
                            onchange:  function (e) { self.categoryId = e.target.value; },
                        }, [
                            m('option', { value: '' }, '— Uncategorized —'),
                            (self.attrs.categories || []).map(function (cat) {
                                return m('option', { value: cat.id, key: 'c-' + cat.id }, cat.attributes.name);
                            }),
                        ]),
                    ]),
                    m('div', { className: 'Form-group' }, [
                        m('label', null, 'Visibility'),
                        m('select', {
                            className: 'FormControl',
                            value:     self.visibility,
                            disabled:  self.saving,
                            onchange:  function (e) { self.visibility = e.target.value; },
                        }, [
                            m('option', { value: 'public' }, 'Public — anyone can read'),
                            m('option', { value: 'members' }, 'Members only — login required'),
                        ]),
                    ]),
                    m('div', { className: 'Form-group LinkRobinsBlog-editor-commentsToggle' }, [
                        m('label', null, 'Comments'),
                        m('label', { className: 'LinkRobinsBlog-editor-commentsToggle-row' }, [
                            m('input', {
                                type:     'checkbox',
                                checked:  self.commentsEnabled !== false,
                                disabled: self.saving,
                                onchange: function (e) { self.commentsEnabled = !!e.target.checked; },
                            }),
                            m('span', null, ' Allow comments on this post'),
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
                        title:     'Upload image(s)',
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
                        placeholder: 'Write in markdown. **bold**, *italic*, [links](https://...), and so on.',
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
                        ' Uploading ' + (self.bodyUploadIndex || 0) + ' of ' + (self.bodyUploadTotal || 0) + '…',
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
                        var msg = 'Upload failed.';
                        if (err && err.response && err.response.errors && err.response.errors[0]) {
                            var e = err.response.errors[0];
                            msg = e.detail || e.title || msg;
                        } else if (err && err.status === 404) {
                            msg = 'Upload endpoint not found. Is the fof/upload extension installed and enabled?';
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
                            ? 'Saving…'
                            : (self.editId
                                ? (self.isPublished ? 'Update' : 'Publish')
                                : 'Publish')),
                        m('button', {
                            type:      'button',
                            className: 'Button',
                            disabled:  !canSave,
                            onclick:   function () { self._save(false); },
                        }, self.saving ? 'Saving…' : 'Save as draft'),
                        m('button', {
                            type:      'button',
                            className: 'Button Button--text',
                            disabled:  self.saving,
                            onclick:   function () { self.hide(); },
                        }, 'Cancel'),
                    ]),
                ];

                if (self.editId) {
                    children.push(
                        m('button', {
                            type:      'button',
                            className: 'Button Button--text LinkRobinsBlog-editor-deleteBtn',
                            disabled:  self.saving,
                            onclick:   function () {
                                if (!window.confirm('Delete this post? This cannot be undone.')) return;
                                self.saving = true;
                                self.error  = null;
                                m.redraw();
                                deleteBlogPost(self.editId).then(function () {
                                    var cb = self.attrs && self.attrs.onSaved;
                                    if (cb) cb();
                                    self.hide();
                                }).catch(function (err) {
                                    self.saving = false;
                                    self.error  = err;
                                    m.redraw();
                                });
                            },
                        }, 'Delete Post')
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
                    title:            self.titleText.trim(),
                    slug:             self.slug.trim() || slugify(self.titleText),
                    excerpt:          self.excerpt || '',
                    content:          self.bodyText,
                    coverImageUrl:    self.cover || null,
                    coverImageCredit: (self.coverCredit && self.coverCredit.trim()) || null,
                    visibility:       self.visibility,
                    isPublished:      publishFlag,
                    commentsEnabled:  self.commentsEnabled !== false,
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

    function makeCategoryEditorModal(Modal) {
        return class CategoryEditorModal extends Modal {
            static get isDismissibleViaBackdropClick() { return false; }

            oninit(vnode) {
                super.oninit(vnode);
                var cat  = this.attrs.category;
                var attr = cat ? (cat.attributes || {}) : {};
                this.editId      = cat ? cat.id : null;
                this.categoryName = attr.name || '';
                this.slug        = attr.slug || '';
                this.description = attr.description || '';
                this.color       = attr.color || '#7f7f7f';
                this.icon        = attr.icon  || 'fas fa-folder';
                this.position    = (typeof attr.position === 'number') ? attr.position : 0;
                this.saving      = false;
                this.error       = null;
                this._userEditedSlug = !!cat;
            }

            className() { return 'Modal--medium LinkRobinsBlog-categoryEditorModal'; }
            title()     { return this.editId ? 'Edit category' : 'New category'; }

            content() {
                var self = this;
                return m('div', { className: 'Modal-body LinkRobinsBlog-categoryEditor' }, [
                    self.error ? m('div', { className: 'Alert Alert--danger' }, [
                        m('span', { className: 'Alert-body' }, 'Could not save: ' + self._errorMessage()),
                    ]) : null,

                    m('div', { className: 'Form-body' }, [
                        m('div', { className: 'Form-group' }, [
                            m('label', null, 'Name'),
                            m('input', {
                                type:        'text',
                                className:   'FormControl',
                                value:       self.categoryName,
                                placeholder: 'e.g. Announcements',
                                autofocus:   true,
                                oninput: function (e) {
                                    self.categoryName = e.target.value;
                                    if (!self._userEditedSlug) {
                                        self.slug = slugify(self.categoryName);
                                    }
                                },
                            }),
                        ]),

                        m('div', { className: 'Form-group' }, [
                            m('label', null, 'Slug'),
                            m('input', {
                                type:        'text',
                                className:   'FormControl',
                                value:       self.slug,
                                placeholder: 'auto-generated from name',
                                oninput: function (e) {
                                    self.slug = e.target.value;
                                    self._userEditedSlug = true;
                                },
                            }),
                            m('div', { className: 'helpText' }, 'Used in category URLs: /blog/category/<slug>'),
                        ]),

                        m('div', { className: 'Form-group' }, [
                            m('label', null, 'Description (optional)'),
                            m('textarea', {
                                className:   'FormControl',
                                rows:        2,
                                value:       self.description,
                                placeholder: 'Short description shown on hover and in the category hero.',
                                oninput:     function (e) { self.description = e.target.value; },
                            }),
                        ]),

                        m('div', { className: 'LinkRobinsBlog-categoryEditor-row' }, [
                            m('div', { className: 'Form-group LinkRobinsBlog-categoryEditor-colorGroup' }, [
                                m('label', null, 'Color'),
                                m('div', { className: 'LinkRobinsBlog-categoryEditor-colorRow' }, [
                                    m('input', {
                                        type:      'color',
                                        className: 'LinkRobinsBlog-categoryEditor-colorPicker',
                                        value:     /^#[0-9a-fA-F]{6}$/.test(self.color) ? self.color : '#7f7f7f',
                                        oninput:   function (e) { self.color = e.target.value; },
                                    }),
                                    m('input', {
                                        type:        'text',
                                        className:   'FormControl',
                                        value:       self.color,
                                        placeholder: '#7f7f7f',
                                        oninput:     function (e) { self.color = e.target.value; },
                                    }),
                                ]),
                            ]),

                            m('div', { className: 'Form-group LinkRobinsBlog-categoryEditor-iconGroup' }, [
                                m('label', null, 'Icon (Font Awesome class)'),
                                m('div', { className: 'LinkRobinsBlog-categoryEditor-iconRow' }, [
                                    m('span', { className: 'LinkRobinsBlog-categoryEditor-iconPreview' },
                                        m('i', { className: self.icon || 'fas fa-folder' })
                                    ),
                                    m('input', {
                                        type:        'text',
                                        className:   'FormControl',
                                        value:       self.icon,
                                        placeholder: 'fas fa-folder',
                                        oninput:     function (e) { self.icon = e.target.value; },
                                    }),
                                ]),
                                m('div', { className: 'helpText' }, 'e.g. fas fa-newspaper, far fa-comments, fab fa-github'),
                            ]),

                            m('div', { className: 'Form-group LinkRobinsBlog-categoryEditor-posGroup' }, [
                                m('label', null, 'Position'),
                                m('input', {
                                    type:      'number',
                                    className: 'FormControl',
                                    value:     self.position,
                                    min:       0,
                                    step:      1,
                                    oninput:   function (e) {
                                        var v = parseInt(e.target.value, 10);
                                        self.position = isNaN(v) ? 0 : v;
                                    },
                                }),
                                m('div', { className: 'helpText' }, 'Lower numbers sort first.'),
                            ]),
                        ]),
                    ]),

                    m('div', { className: 'Form-group LinkRobinsBlog-categoryEditor-actions' }, [
                        m('button', {
                            type:      'submit',
                            className: 'Button Button--primary',
                            disabled:  self.saving || !self.categoryName.trim(),
                            onclick:   function (e) { e.preventDefault(); self._save(); },
                        }, self.saving ? 'Saving…' : (self.editId ? 'Save changes' : 'Create category')),
                        m('button', {
                            type:      'button',
                            className: 'Button',
                            disabled:  self.saving,
                            onclick:   function () { self.hide(); },
                        }, 'Cancel'),
                    ]),
                ]);
            }

            _errorMessage() {
                var err = this.error;
                if (!err) return 'Unknown error.';
                if (err.response && err.response.errors && err.response.errors[0]) {
                    var e = err.response.errors[0];
                    return e.detail || e.title || (e.code || 'Validation error');
                }
                return err.message || 'Unknown error.';
            }

            _save() {
                var self = this;
                if (self.saving) return;
                self.saving = true;
                self.error  = null;
                m.redraw();

                var attributes = {
                    name:        self.categoryName.trim(),
                    description: (self.description || '').trim() || null,
                    color:       (self.color || '').trim() || null,
                    icon:        (self.icon  || '').trim() || null,
                    position:    self.position || 0,
                };
                if (self.slug && self.slug.trim() !== '') attributes.slug = self.slug.trim();

                var promise = self.editId
                    ? updateBlogCategory(self.editId, attributes)
                    : createBlogCategory(attributes);

                promise
                    .then(function () {
                        self.saving = false;
                        if (typeof self.attrs.onSaved === 'function') self.attrs.onSaved();
                        self.hide();
                    })
                    .catch(function (err) {
                        self.saving = false;
                        self.error  = err;
                        console.error('[linkrobins/blog] save category failed:', err);
                        m.redraw();
                    });
            }
        };
    }

    if (typeof app !== 'undefined' && app.initializers && typeof app.initializers.add === 'function') {
        app.initializers.add('linkrobins-blog', init);
    }

})();

module.exports = {};
