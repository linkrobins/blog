<?php

namespace LinkRobins\Blog\Access;

use Flarum\User\Access\AbstractPolicy;
use Flarum\User\User;
use LinkRobins\Blog\BlogPost;

class BlogPostPolicy extends AbstractPolicy
{
    public function view(User $actor, BlogPost $post): bool
    {
        if (! $post->is_published) {
            return $actor->isAdmin();
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
        return $actor->isAdmin();
    }

    public function delete(User $actor, BlogPost $post): bool
    {
        return $actor->isAdmin();
    }
}
