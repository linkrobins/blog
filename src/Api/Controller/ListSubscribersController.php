<?php

namespace LinkRobins\Blog\Api\Controller;

use Flarum\Http\RequestUtil;
use Laminas\Diactoros\Response\JsonResponse;
use Laminas\Diactoros\Response\TextResponse;
use LinkRobins\Blog\BlogSubscriber;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\RequestHandlerInterface;

/**
 * Admin-only subscribers endpoint.
 *
 *   GET /api/linkrobins-blog/subscribers             -> { count: N }
 *   GET /api/linkrobins-blog/subscribers?format=csv  -> CSV download
 *
 * The CSV download is the hand-off for external broadcasting.
 */
class ListSubscribersController implements RequestHandlerInterface
{
    public function handle(ServerRequestInterface $request): ResponseInterface
    {
        $actor = RequestUtil::getActor($request);

        if (! $actor->isAdmin()) {
            return new JsonResponse([
                'errors' => [[
                    'status' => '403',
                    'code'   => 'forbidden',
                    'detail' => 'You must be an admin to view subscribers.',
                ]],
            ], 403);
        }

        $format = (string) ($request->getQueryParams()['format'] ?? 'json');

        if ($format === 'csv') {
            return $this->csv();
        }

        return new JsonResponse([
            'count' => BlogSubscriber::query()->count(),
        ]);
    }

    protected function csv(): ResponseInterface
    {
        $rows = [['email', 'username', 'subscribed_at']];

        BlogSubscriber::query()
            ->with('user')
            ->orderBy('id')
            ->chunk(500, function ($chunk) use (&$rows) {
                foreach ($chunk as $sub) {
                    if (! $sub->user) {
                        continue;
                    }
                    $rows[] = [
                        (string) $sub->user->email,
                        (string) $sub->user->username,
                        $sub->created_at ? $sub->created_at->toIso8601String() : '',
                    ];
                }
            });

        // RFC-4180 CSV quoting: wrap any cell with quote/comma/CR/LF in
        // double quotes, double up internal quotes. Cells starting with
        // a formula-trigger character (=, +, -, @, tab, CR) also get a
        // leading single-quote prefix to neutralise Excel/Sheets formula
        // injection on open. Usernames are constrained to [a-z0-9_-]+ by
        // Flarum so they can't trigger this in practice; emails CAN start
        // with + (e.g. RFC-valid `+tag@example.com`) so we cover them too.
        $lines = [];
        foreach ($rows as $row) {
            $escaped = array_map(function ($cell) {
                $cell = (string) $cell;
                if ($cell !== '' && in_array($cell[0], ['=', '+', '-', '@', "\t", "\r"], true)) {
                    $cell = "'" . $cell;
                }
                if (preg_match('/[",\r\n]/', $cell)) {
                    return '"' . str_replace('"', '""', $cell) . '"';
                }
                return $cell;
            }, $row);
            $lines[] = implode(',', $escaped);
        }
        $body = implode("\r\n", $lines) . "\r\n";

        $filename = 'linkrobins-blog-subscribers-' . date('Y-m-d') . '.csv';

        return new TextResponse($body, 200, [
            'Content-Type'        => 'text/csv; charset=utf-8',
            'Content-Disposition' => 'attachment; filename="' . $filename . '"',
        ]);
    }
}
