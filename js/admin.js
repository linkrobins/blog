'use strict';

(function () {

    app.initializers.add('linkrobins/blog', function () {

        try {
            var BasicsPage = flarum.reg.get('core', 'admin/components/BasicsPage');
            var extMod     = flarum.reg.get('core', 'common/extend');
            var extend     = extMod && extMod.extend;

            if (BasicsPage && typeof extend === 'function') {
                extend(BasicsPage, 'homePageItems', function (items) {
                    items.add('linkrobins-blog', {
                        path:  '/blog',
                        label: app.translator.trans('linkrobins-blog.admin.basics.home_label'),
                    });
                });
            }
        } catch (e) {
            console.error('[linkrobins/blog] could not register homepage option:', e);
        }

        if (!app.registry || typeof app.registry.for !== 'function') {
            console.warn('[linkrobins/blog] app.registry not available');
            return;
        }

        var t = function (key) {
            return app.translator.trans('linkrobins-blog.admin.settings.' + key);
        };

        app.registry
            .for('linkrobins-blog')

            .registerSetting(function () {
                var page  = this;
                var value = page.setting('linkrobins-blog.tag_slugs', 'blog');

                return m('div', { className: 'Form-group' },
                    m('label', t('tag_slugs_label')),
                    m('textarea', {
                        className:   'FormControl LinkRobinsBlog-tagSlugsTextarea',
                        rows:        4,
                        value:       value(),
                        oninput:     function (e) { value(e.target.value); },
                        placeholder: "blog\nnews\ntutorials",
                    }),
                    m('p', { className: 'helpText' }, t('tag_slugs_help'))
                );
            }, 100, 'linkrobins-blog.tag_slugs')

            .registerSetting({
                setting:     'linkrobins-blog.title',
                type:        'text',
                label:       t('title_label'),
                help:        t('title_help'),
                placeholder: 'My Blog',
            })

            .registerSetting({
                setting:     'linkrobins-blog.tagline',
                type:        'text',
                label:       t('tagline_label'),
                help:        t('tagline_help'),
                placeholder: 'Thoughts, stories, and ideas.',
            })

            .registerSetting({
                setting: 'linkrobins-blog.show_featured',
                type:    'boolean',
                label:   t('show_featured_label'),
                help:    t('show_featured_help'),
            })

            .registerSetting({
                setting:     'linkrobins-blog.nav_label',
                type:        'text',
                label:       t('nav_label_label'),
                help:        t('nav_label_help'),
                placeholder: 'Blog',
            })

            .registerSetting({
                setting:     'linkrobins-blog.nav_icon',
                type:        'text',
                label:       t('nav_icon_label'),
                help:        t('nav_icon_help'),
                placeholder: 'fas fa-feather-alt',
            })

            .registerSetting(function () {
                var page  = this;
                var value = page.setting('linkrobins-blog.header_mode', 'text');

                return m('div', { className: 'Form-group' },
                    m('label', t('header_mode_label')),
                    m('select', {
                        className: 'FormControl',
                        value:     value() || 'text',
                        onchange:  function (e) { value(e.target.value); },
                    }, [
                        m('option', { value: 'text' },   t('header_mode_text')),
                        m('option', { value: 'logo' },   t('header_mode_logo')),
                        m('option', { value: 'custom' }, t('header_mode_custom')),
                    ]),
                    m('p', { className: 'helpText' }, t('header_mode_help'))
                );
            }, 80, 'linkrobins-blog.header_mode')

            .registerSetting({
                setting:     'linkrobins-blog.custom_logo_url',
                type:        'text',
                label:       t('custom_logo_url_label'),
                help:        t('custom_logo_url_help'),
                placeholder: 'https://example.com/my-blog-logo.png',
            })

            .registerSetting(function () {
                return m('div', { className: 'Form-group LinkRobinsBlog-homepage-pointer' },
                    m('label', t('homepage_label')),
                    m('p', { className: 'helpText' }, t('homepage_pointer_help'))
                );
            }, 0, 'linkrobins-blog.homepage-pointer');
    });

})();

module.exports = {};

