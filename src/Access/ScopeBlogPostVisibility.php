<?php

namespace LinkRobins\Blog\Access;

use Flarum\User\User;
use Illuminate\Database\Eloquent\Builder;

class ScopeBlogPostVisibility
{
    public function __invoke(User $actor, Builder $query): void
    {
        if ($actor->isAdmin()) {
            return;
        }
        if (! $actor->isGuest() && $actor->hasPermission('linkrobins-blog.moderate')) {
            return;
        }
        if (! $actor->isGuest() && $actor->hasPermission('linkrobins-blog.start')) {
            $actorId = (int) $actor->id;
            $query->where(function ($q) use ($actorId) {
                $q->where('linkrobins_blog_posts.is_published', true)
                  ->orWhere('linkrobins_blog_posts.user_id', $actorId);
            });
            return;
        }

        $query->where('linkrobins_blog_posts.is_published', true);
    }
}
