<?php

namespace LinkRobins\Blog;

use Flarum\Database\AbstractModel;
use Flarum\User\User;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Str;

/**
 * Newsletter subscriber. One row per subscribed user.
 *
 * Stores the user_id rather than the email so email changes in Flarum
 * follow the subscription, and account deletion cascades the row out via
 * the FK on user_id.
 *
 * unsubscribe_token is auto-generated at row creation and is intentionally
 * NOT in $fillable -- callers should never set it via mass assignment.
 */
class BlogSubscriber extends AbstractModel
{
    protected $table = 'linkrobins_blog_subscribers';

    public $timestamps = false;

    protected $casts = [
        'created_at' => 'datetime',
    ];

    protected $fillable = ['user_id', 'created_at'];

    protected static function booted(): void
    {
        static::creating(function (BlogSubscriber $model) {
            if (empty($model->unsubscribe_token)) {
                $model->unsubscribe_token = Str::random(64);
            }
        });
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }
}
