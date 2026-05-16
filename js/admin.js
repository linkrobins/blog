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
        var CategoryEditorModal = Modal ? makeCategoryEditorModal(Modal) : null;

        if (!app.registry || typeof app.registry.for !== 'function') {
            console.warn('[linkrobins/blog] app.registry not available');
            return;
        }

        app.registry
            .for('linkrobins-blog')
            .registerPage(BlogAdminPage);

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

        // Register the two blog permissions so they appear on the admin
        // Permissions page. The .start permission grants authoring rights;
        // .moderate grants editing/deleting others' posts.
        try {
            if (app.registry && typeof app.registry.registerPermission === 'function') {
                app.registry.registerPermission({
                    permission: 'linkrobins-blog.start',
                    icon:       'fas fa-feather-alt',
                    label:      'Create blog posts',
                }, 'start', 95);
                app.registry.registerPermission({
                    permission: 'linkrobins-blog.moderate',
                    icon:       'fas fa-feather-alt',
                    label:      'Edit and delete any blog post',
                }, 'moderate', 95);
            }
        } catch (e) {
            console.warn('[linkrobins/blog] could not register permissions:', e);
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
                this.tab          = 'categories';
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

                fetchCategoriesList()
                    .then(function (categoriesResp) {
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
                if (this.tab === 'categories')  return this._renderCategoriesTab();
                if (this.tab === 'subscribers') return this._renderSubscribersTab();
                if (this.tab === 'settings')    return this._renderSettingsTab();
                return m('div', { className: 'LinkRobinsBlog-admin-empty' }, 'Coming soon.');
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
                this.newsletterEnabled = !!attr.newsletterEnabled;
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

                        m('div', { className: 'Form-group' }, [
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

                        m('div', { className: 'Form-group' }, [
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

                        m('div', { className: 'Form-group' }, [
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

                        m('div', { className: 'Form-group' }, [
                            m('label', { className: 'LinkRobinsBlog-categoryEditor-toggleRow' }, [
                                m('input', {
                                    type:    'checkbox',
                                    checked: self.newsletterEnabled,
                                    onchange: function (e) { self.newsletterEnabled = !!e.target.checked; },
                                }),
                                ' Send newsletter when a post is published in this category',
                            ]),
                            m('div', { className: 'helpText' },
                                'Every subscriber will be emailed automatically when a post is first published here. '
                                + 'Make sure your SMTP and sending domain are configured before turning this on.'),
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
                    newsletterEnabled: !!self.newsletterEnabled,
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
