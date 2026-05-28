'use strict';

(function () {

    // Short helper for translator lookups. Returns the translated string, or
    // the key itself if no translation is registered (Flarum's default
    // fallback behaviour). All admin-side strings live under
    // 'linkrobins-blog.admin.*' or 'linkrobins-blog.ref.*'.
    function t(key, params) {
        try {
            return app.translator.trans('linkrobins-blog.' + key, params || {});
        } catch (e) {
            return key;
        }
    }

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
        if (!file) { cb(null, t('admin.settings.upload_no_file')); return; }
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
            else cb(null, t('admin.settings.upload_no_url'));
        })
        .catch(function (err) {
            console.error('[linkrobins/blog] upload failed:', err);
            var msg = t('admin.settings.upload_failed');
            if (err && err.response && err.response.errors && err.response.errors[0]) {
                var e = err.response.errors[0];
                msg = e.detail || e.title || msg;
            } else if (err && err.status === 404) {
                msg = t('admin.settings.upload_endpoint_missing');
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
                        label: t('admin.permissions.group_heading'),
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
                    label:      t('admin.permissions.start_label'),
                }, 'start', 95);
                app.registry.registerPermission({
                    permission: 'linkrobins-blog.moderate',
                    icon:       'fas fa-feather-alt',
                    label:      t('admin.permissions.moderate_label'),
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
                    { id: 'categories',  label: t('admin.tabs.categories'),  icon: 'fas fa-folder' },
                    { id: 'subscribers', label: t('admin.tabs.subscribers'), icon: 'fas fa-envelope' },
                    { id: 'settings',    label: t('admin.tabs.settings'),    icon: 'fas fa-sliders-h' },
                ];
                return m('div', { className: 'LinkRobinsBlog-admin-tabs' },
                    tabs.map(function (tab) {
                        return m('button', {
                            type:      'button',
                            className: 'LinkRobinsBlog-admin-tab'
                                + (self.tab === tab.id ? ' is-active' : '')
                                + (tab.disabled ? ' is-disabled' : ''),
                            title:     tab.hint || '',
                            disabled:  tab.disabled,
                            onclick:   function () { if (!tab.disabled) { self.tab = tab.id; } },
                        }, [
                            m('i', { className: tab.icon }),
                            ' ',
                            tab.label,
                            tab.disabled ? m('span', { className: 'LinkRobinsBlog-admin-tab-hint' }, t('admin.tabs.soon_badge')) : null,
                        ]);
                    })
                );
            }

            _renderTabContent() {
                if (this.tab === 'categories')  return this._renderCategoriesTab();
                if (this.tab === 'subscribers') return this._renderSubscribersTab();
                if (this.tab === 'settings')    return this._renderSettingsTab();
                return m('div', { className: 'LinkRobinsBlog-admin-empty' }, t('admin.categories.loading'));
            }

            _renderCategoriesTab() {
                var self = this;
                if (self.loading) {
                    return m('div', { className: 'LinkRobinsBlog-admin-loading' },
                        LoadingIndicator ? m(LoadingIndicator) : t('admin.categories.loading'));
                }
                if (self.error) {
                    return m('div', { className: 'LinkRobinsBlog-admin-empty' }, t('admin.categories.load_failed'));
                }

                return m('div', { className: 'LinkRobinsBlog-admin-categories' }, [
                    m('div', { className: 'LinkRobinsBlog-admin-postsHeader' }, [
                        m('h3', null, t('admin.categories.heading', { count: self.categories.length })),
                        m('button', {
                            type:      'button',
                            className: 'Button Button--primary',
                            onclick:   function () { self._openCategoryEditor(null); },
                        }, [m('i', { className: 'fas fa-plus' }), ' ', t('admin.categories.new_button')]),
                    ]),

                    self.categories.length === 0
                        ? m('div', { className: 'LinkRobinsBlog-admin-empty' },
                            t('admin.categories.empty'))
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
                            m('th', null, t('admin.categories.col_position')),
                            m('th', null, t('admin.categories.col_name')),
                            m('th', null, t('admin.categories.col_slug')),
                            m('th', null, t('admin.categories.col_posts')),
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
                            title:     t('admin.categories.action_edit'),
                            onclick:   function () { self._openCategoryEditor(cat); },
                        }, m('i', { className: 'fas fa-pen' })),
                        m('button', {
                            type:      'button',
                            className: 'Button Button--icon Button--link',
                            title:     t('admin.categories.action_delete'),
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
                var name = attr.name || t('admin.categories.fallback_name', { id: cat.id });
                var count = typeof attr.postCount === 'number' ? attr.postCount : null;
                var warn;
                if (count && count > 0) {
                    var key = count === 1
                        ? 'admin.categories.delete_confirm_with_posts_one'
                        : 'admin.categories.delete_confirm_with_posts_many';
                    warn = t(key, { name: name, count: count });
                } else {
                    warn = t('admin.categories.delete_confirm', { name: name });
                }
                if (!window.confirm(warn)) return;

                app.request({
                    method: 'DELETE',
                    url:    app.forum.attribute('apiUrl') + '/linkrobins-blog-categories/' + cat.id,
                })
                .then(function () { self._loadData(); })
                .catch(function (err) {
                    console.error('[linkrobins/blog] delete category failed:', err);
                    try { alert(t('admin.categories.delete_failed')); } catch (e) {}
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
                        m('h2', null, t('admin.subscribers.heading')),
                        m('p', { className: 'LinkRobinsBlog-admin-subscribers-blurb' },
                            t('admin.subscribers.blurb')),
                    ]),

                    m('div', { className: 'LinkRobinsBlog-admin-subscribers-stats' }, [
                        m('div', { className: 'LinkRobinsBlog-admin-subscribers-stat' }, [
                            m('div', { className: 'LinkRobinsBlog-admin-subscribers-statLabel' }, t('admin.subscribers.count_label')),
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
                        }, [m('i', { className: 'fas fa-sync' }), ' ', t('admin.categories.refresh_button')]),
                        m('a', {
                            href:      csvUrl,
                            className: 'Button Button--primary',
                        }, [m('i', { className: 'fas fa-download' }), ' ', t('admin.subscribers.download_csv')]),
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
                    self._subscriberError = t('admin.subscribers.load_failed');
                    m.redraw();
                });
            }

            _renderSettingsTab() {
                var self = this;

                var headerModeOptions = {
                    text: t('admin.settings.header_mode_text'),
                    logo: t('admin.settings.header_mode_logo'),
                    none: t('admin.settings.header_mode_none'),
                };

                var heroModeOptions = {
                    none:     t('admin.settings.hero_bg_none'),
                    image:    t('admin.settings.hero_bg_image'),
                    gradient: t('admin.settings.hero_bg_gradient'),
                };

                var fields = [
                    { section: t('admin.settings.section_brand'), items: [
                        { setting: 'linkrobins-blog.title',
                          type: 'text', label: t('admin.settings.title_label'),
                          help: t('admin.settings.title_help'),
                          placeholder: app.forum.attribute('title') || t('admin.settings.title_placeholder_fallback') },
                        { setting: 'linkrobins-blog.tagline',
                          type: 'text', label: t('admin.settings.tagline_label'),
                          help: t('admin.settings.tagline_help'),
                          placeholder: t('admin.settings.tagline_placeholder') },
                    ] },

                    { section: t('admin.settings.section_hero'), items: [
                        { setting: 'linkrobins-blog.header_mode',
                          type: 'select', label: t('admin.settings.header_mode_label'),
                          help: t('admin.settings.header_mode_help'),
                          options: headerModeOptions, default: 'text' },
                        { setting: 'linkrobins-blog.hero_background_mode',
                          type: 'select', label: t('admin.settings.hero_bg_label'),
                          help: t('admin.settings.hero_bg_help'),
                          options: heroModeOptions, default: 'none' },
                        function () {
                            // Custom renderer for hero background image URL with optional fof/upload picker.
                            var page = this;
                            var key  = 'linkrobins-blog.hero_background_url';
                            var current = page.setting(key)() || '';
                            var hasFofUpload = isFofUploadInstalled();

                            return m('div', { className: 'Form-group LinkRobinsBlog-settings-heroBgGroup' }, [
                                m('label', null, t('admin.settings.hero_bg_image_label')),
                                m('div', { className: 'LinkRobinsBlog-settings-heroBgInputRow' }, [
                                    m('input', {
                                        type:        'url',
                                        className:   'FormControl',
                                        value:       current,
                                        placeholder: t('admin.settings.hero_bg_image_placeholder'),
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
                                        page._heroBgUploading ? t('admin.settings.hero_bg_uploading') : t('admin.settings.hero_bg_upload_button'),
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
                                                    page._heroBgError = err || t('admin.settings.upload_failed');
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
                                        ? t('admin.settings.hero_bg_image_help_with_upload')
                                        : t('admin.settings.hero_bg_image_help_no_upload')
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
                          type: 'number', label: t('admin.settings.hero_overlay_label'),
                          help: t('admin.settings.hero_overlay_help'),
                          min: 0, max: 90, default: '40' },
                    ] },

                    { section: t('admin.settings.section_nav'), items: [
                        { setting: 'linkrobins-blog.nav_label',
                          type: 'text', label: t('admin.settings.nav_label_label'),
                          help: t('admin.settings.nav_label_help'),
                          placeholder: t('admin.settings.nav_label_placeholder') },
                        { setting: 'linkrobins-blog.nav_icon',
                          type: 'text', label: t('admin.settings.nav_icon_label'),
                          help: t('admin.settings.nav_icon_help'),
                          placeholder: t('admin.settings.nav_icon_placeholder') },
                    ] },

                    { section: t('admin.settings.section_layout'), items: [
                        { setting: 'linkrobins-blog.posts_per_page',
                          type: 'number', label: t('admin.settings.posts_per_page_label'),
                          help: t('admin.settings.posts_per_page_help'),
                          min: 1, max: 50, default: '12' },
                        { setting: 'linkrobins-blog.members_teaser_chars',
                          type: 'number', label: t('admin.settings.members_teaser_label'),
                          help: t('admin.settings.members_teaser_help'),
                          min: 50, max: 5000, default: '500' },
                    ] },

                    { section: t('admin.settings.section_about'), items: [
                        { setting: 'linkrobins-blog.about_title',
                          type: 'text', label: t('admin.settings.about_title_label'),
                          help: t('admin.settings.about_title_help'),
                          placeholder: t('admin.settings.about_title_placeholder') },
                        { setting: 'linkrobins-blog.about_html',
                          type: 'textarea', label: t('admin.settings.about_html_label'),
                          help: t('admin.settings.about_html_help'),
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
                        }, self.loading ? t('admin.settings.saving') : t('admin.settings.save_button')),
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
            title()     { return this.editId ? t('admin.edit_category.title_edit') : t('admin.edit_category.title_create'); }

            content() {
                var self = this;
                return m('div', { className: 'Modal-body LinkRobinsBlog-categoryEditor' }, [
                    self.error ? m('div', { className: 'Alert Alert--danger' }, [
                        m('span', { className: 'Alert-body' }, t('admin.edit_category.save_failed', { detail: self._errorMessage() })),
                    ]) : null,

                    m('div', { className: 'Form-body' }, [
                        m('div', { className: 'Form-group' }, [
                            m('label', null, t('admin.edit_category.name_label')),
                            m('input', {
                                type:        'text',
                                className:   'FormControl',
                                value:       self.categoryName,
                                placeholder: t('admin.edit_category.name_placeholder'),
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
                            m('label', null, t('admin.edit_category.slug_label')),
                            m('input', {
                                type:        'text',
                                className:   'FormControl',
                                value:       self.slug,
                                placeholder: t('admin.edit_category.slug_placeholder'),
                                oninput: function (e) {
                                    self.slug = e.target.value;
                                    self._userEditedSlug = true;
                                },
                            }),
                            m('div', { className: 'helpText' }, t('admin.edit_category.slug_help')),
                        ]),

                        m('div', { className: 'Form-group' }, [
                            m('label', null, t('admin.edit_category.description_label')),
                            m('textarea', {
                                className:   'FormControl',
                                rows:        2,
                                value:       self.description,
                                placeholder: t('admin.edit_category.description_placeholder'),
                                oninput:     function (e) { self.description = e.target.value; },
                            }),
                        ]),

                        m('div', { className: 'Form-group' }, [
                            m('label', null, t('admin.edit_category.color_label')),
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
                                    placeholder: t('admin.edit_category.color_placeholder'),
                                    oninput:     function (e) { self.color = e.target.value; },
                                }),
                            ]),
                        ]),

                        m('div', { className: 'Form-group' }, [
                            m('label', null, t('admin.edit_category.icon_label')),
                            m('div', { className: 'LinkRobinsBlog-categoryEditor-iconRow' }, [
                                m('span', { className: 'LinkRobinsBlog-categoryEditor-iconPreview' },
                                    m('i', { className: self.icon || 'fas fa-folder' })
                                ),
                                m('input', {
                                    type:        'text',
                                    className:   'FormControl',
                                    value:       self.icon,
                                    placeholder: t('admin.edit_category.icon_placeholder'),
                                    oninput:     function (e) { self.icon = e.target.value; },
                                }),
                            ]),
                            m('div', { className: 'helpText' }, t('admin.edit_category.icon_help')),
                        ]),

                        m('div', { className: 'Form-group' }, [
                            m('label', null, t('admin.edit_category.position_label')),
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
                            m('div', { className: 'helpText' }, t('admin.edit_category.position_help')),
                        ]),

                        m('div', { className: 'Form-group' }, [
                            m('label', { className: 'LinkRobinsBlog-categoryEditor-toggleRow' }, [
                                m('input', {
                                    type:    'checkbox',
                                    checked: self.newsletterEnabled,
                                    onchange: function (e) { self.newsletterEnabled = !!e.target.checked; },
                                }),
                                ' ' + t('admin.edit_category.newsletter_label'),
                            ]),
                            m('div', { className: 'helpText' },
                                t('admin.edit_category.newsletter_help')),
                        ]),
                    ]),

                    m('div', { className: 'Form-group LinkRobinsBlog-categoryEditor-actions' }, [
                        m('button', {
                            type:      'submit',
                            className: 'Button Button--primary',
                            disabled:  self.saving || !self.categoryName.trim(),
                            onclick:   function (e) { e.preventDefault(); self._save(); },
                        }, self.saving ? t('admin.edit_category.saving') : (self.editId ? t('admin.edit_category.save_button') : t('admin.edit_category.create_button'))),
                        m('button', {
                            type:      'button',
                            className: 'Button',
                            disabled:  self.saving,
                            onclick:   function () { self.hide(); },
                        }, t('admin.edit_category.cancel_button')),
                    ]),
                ]);
            }

            _errorMessage() {
                var err = this.error;
                if (!err) return t('admin.edit_category.unknown_error');
                if (err.response && err.response.errors && err.response.errors[0]) {
                    var e = err.response.errors[0];
                    return e.detail || e.title || (e.code || t('admin.edit_category.validation_error'));
                }
                return err.message || t('admin.edit_category.unknown_error');
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
