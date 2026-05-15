<?php

use Flarum\Database\Migration;
use Flarum\Group\Group;

// Default permissions for the comment-reporting system, mirroring flarum/flags semantics:
//   - Moderators can view and dismiss reports
//   - Members (registered users) can report comments
//
// We piggyback on the existing 'discussion.viewFlags' and 'discussion.flagPosts'
// permissions where possible (admins configure both in one place) but also register
// our own dedicated permission strings so blog moderation can be granted separately
// if desired in the future.

return Migration::addPermissions([
    'linkrobins-blog.viewReports'   => Group::MODERATOR_ID,
    'linkrobins-blog.reportComment' => Group::MEMBER_ID,
]);
