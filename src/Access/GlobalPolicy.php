<?php

namespace LinkRobins\Blog\Access;

use Flarum\User\Access\AbstractPolicy;
use Flarum\User\User;

/**
 * Global permissions for the blog.
 *
 * Two new permissions are exposed in Flarum's permissions page:
 *
 *   linkrobins-blog.start    -- can author blog posts (and edit/delete own)
 *   linkrobins-blog.moderate -- can edit/delete posts by anyone (implies .start)
 *
 * Admins always pass. Category and newsletter management remain admin-only.
 */
class GlobalPolicy extends AbstractPolicy
{
    public function createBlogPost(User $actor): bool
    {
        if ($actor->isAdmin()) {
            return true;
        }
        return $actor->hasPermission('linkrobins-blog.start')
            || $actor->hasPermission('linkrobins-blog.moderate');
    }

    public function moderateBlogPosts(User $actor): bool
    {
        if ($actor->isAdmin()) {
            return true;
        }
        return $actor->hasPermission('linkrobins-blog.moderate');
    }

    public function createBlogCategory(User $actor): bool
    {
        return $actor->isAdmin();
    }

    public function manageBlog(User $actor): bool
    {
        return $actor->isAdmin();
    }
}
