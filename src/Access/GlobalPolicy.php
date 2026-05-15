<?php

namespace LinkRobins\Blog\Access;

use Flarum\User\Access\AbstractPolicy;
use Flarum\User\User;

class GlobalPolicy extends AbstractPolicy
{
    public function createBlogPost(User $actor): bool
    {
        return $actor->isAdmin();
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
