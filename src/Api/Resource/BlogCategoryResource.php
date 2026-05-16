<?php

namespace LinkRobins\Blog\Api\Resource;

use Flarum\Api\Context as FlarumContext;
use Flarum\Api\Endpoint;
use Flarum\Api\Resource\AbstractDatabaseResource;
use Flarum\Api\Schema;
use Flarum\Api\Sort\SortColumn;
use Illuminate\Support\Str;
use LinkRobins\Blog\BlogCategory;
use Tobyz\JsonApiServer\Context;

class BlogCategoryResource extends AbstractDatabaseResource
{
    public function type(): string
    {
        return 'linkrobins-blog-categories';
    }

    public function model(): string
    {
        return BlogCategory::class;
    }

    public function find(string $id, Context $context): ?object
    {
        if (is_numeric($id) && $category = $this->query($context)->find($id)) {
            return $category;
        }

        return $this->query($context)->where('slug', $id)->first();
    }

    public function endpoints(): array
    {
        return [
            Endpoint\Show::make(),
            Endpoint\Index::make(),
            Endpoint\Create::make()
                ->authenticated()
                ->can('createBlogCategory'),
            Endpoint\Update::make()
                ->authenticated()
                ->can('edit'),
            Endpoint\Delete::make()
                ->authenticated()
                ->can('delete'),
        ];
    }

    public function sorts(): array
    {
        return [
            SortColumn::make('position'),
            SortColumn::make('name'),
            SortColumn::make('createdAt'),
        ];
    }

    public function fields(): array
    {
        return [
            Schema\Str::make('name')
                ->requiredOnCreate()
                ->writable()
                ->maxLength(100),
            Schema\Str::make('slug')
                ->writable()
                ->maxLength(100)
                ->unique('linkrobins_blog_categories', 'slug', true)
                ->set(function (BlogCategory $category, ?string $value) {
                    $category->slug = $value ?: Str::slug($category->name);
                }),
            Schema\Str::make('description')
                ->writable()
                ->nullable(),
            Schema\Str::make('color')
                ->writable()
                ->nullable()
                ->maxLength(50)
                // Reject anything that isn't a clean hex colour. The value is
                // interpolated into inline CSS on the forum side; constraining
                // it to a hex shape blocks any chance of CSS injection from a
                // typo or a misuse of the field. Empty/null is allowed (= no
                // colour).
                ->set(function (BlogCategory $category, ?string $value) {
                    if ($value === null || $value === '') {
                        $category->color = null;
                        return;
                    }
                    $trimmed = trim($value);
                    if (! preg_match('/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/', $trimmed)) {
                        // Silently drop invalid values rather than throwing —
                        // matches Flarum's behaviour for other admin-only
                        // colour fields. Logs for visibility.
                        error_log('[linkrobins/blog] rejected non-hex category color: '
                            . substr($trimmed, 0, 50));
                        return;
                    }
                    $category->color = $trimmed;
                }),
            Schema\Str::make('icon')
                ->writable()
                ->nullable()
                ->maxLength(100)
                // Constrain to FontAwesome-style class names: lowercase
                // letters/digits/dashes/spaces only. The icon is interpolated
                // into a className on the forum side; Mithril sets className
                // as a property (not HTML) so script injection is impossible,
                // but this still blocks malformed values from quietly
                // breaking the markup or pulling in unrelated classes.
                ->set(function (BlogCategory $category, ?string $value) {
                    if ($value === null || $value === '') {
                        $category->icon = null;
                        return;
                    }
                    $trimmed = trim($value);
                    if (! preg_match('/^[a-z0-9 \-]+$/', $trimmed)) {
                        error_log('[linkrobins/blog] rejected invalid category icon: '
                            . substr($trimmed, 0, 100));
                        return;
                    }
                    $category->icon = $trimmed;
                }),
            Schema\Integer::make('position')
                ->writable(),
            Schema\Boolean::make('newsletterEnabled')
                ->property('newsletter_enabled')
                ->writable(),
            Schema\Integer::make('postCount')
                ->get(fn (BlogCategory $category) => $category->posts()->count()),
            Schema\DateTime::make('createdAt')
                ->property('created_at'),
            Schema\DateTime::make('updatedAt')
                ->property('updated_at'),
        ];
    }
}
