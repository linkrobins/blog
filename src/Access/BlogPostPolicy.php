<?php

namespace LinkRobins\Blog\Access;

use Flarum\User\Access\AbstractPolicy;
use Flarum\User\User;
use LinkRobins\Blog\BlogPost;

/**
 * Per-post permissions.
 *
 * Editing/deleting own posts requires `linkrobins-blog.start`. Editing or
 * deleting someone else's post requires `linkrobins-blog.moderate`. Admins
 * pass everything.
 */
class BlogPostPolicy extends AbstractPolicy
{
    public function view(User $actor, BlogPost $post): bool
    {
        if (! $post->is_published) {
            if ($actor->isAdmin()) {
                return true;
            }
            if ($actor->hasPermission('linkrobins-blog.moderate')) {
                return true;
            }
            return $this->isOwner($actor, $post)
                && $actor->hasPermission('linkrobins-blog.start');
        }
        return true;
    }

    public function viewBody(User $actor, BlogPost $post): bool
    {
        if (! $this->view($actor, $post)) {
            return false;
        }
        if ($post->isMembersOnly()) {
            return ! $actor->isGuest();
        }
        return true;
    }

    public function comment(User $actor, BlogPost $post): bool
    {
        if (! $this->view($actor, $post)) {
            return false;
        }
        return ! $actor->isGuest();
    }

    public function edit(User $actor, BlogPost $post): bool
    {
        if ($actor->isAdmin()) {
            return true;
        }
        if ($actor->hasPermission('linkrobins-blog.moderate')) {
            return true;
        }
        return $this->isOwner($actor, $post)
            && $actor->hasPermission('linkrobins-blog.start');
    }

    public function delete(User $actor, BlogPost $post): bool
    {
        return $this->edit($actor, $post);
    }

    protected function isOwner(User $actor, BlogPost $post): bool
    {
        return ! $actor->isGuest()
            && $post->user_id !== null
            && (int) $post->user_id === (int) $actor->id;
    }
}
