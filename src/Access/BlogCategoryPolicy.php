<?php

namespace LinkRobins\Blog\Access;

use Flarum\User\Access\AbstractPolicy;
use Flarum\User\User;
use LinkRobins\Blog\BlogCategory;

class BlogCategoryPolicy extends AbstractPolicy
{
    public function view(User $actor, BlogCategory $category): bool
    {
        return true;
    }

    public function edit(User $actor, BlogCategory $category): bool
    {
        return $actor->isAdmin();
    }

    public function delete(User $actor, BlogCategory $category): bool
    {
        return $actor->isAdmin();
    }
}
