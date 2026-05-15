<?php

namespace LinkRobins\Blog;

use Flarum\Database\AbstractModel;
use Illuminate\Database\Eloquent\Relations\HasMany;

class BlogCategory extends AbstractModel
{
    protected $table = 'linkrobins_blog_categories';

    public $timestamps = true;

    protected $fillable = [
        'name',
        'slug',
        'description',
        'color',
        'icon',
        'position',
    ];

    protected $casts = [
        'position' => 'integer',
    ];

    public function posts(): HasMany
    {
        return $this->hasMany(BlogPost::class, 'category_id');
    }
}
