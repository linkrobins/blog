<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>{{ $post->title }}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#222;-webkit-font-smoothing:antialiased;">

@if($excerpt)
<div style="display:none;font-size:1px;color:#f4f4f6;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">
    {{ $excerpt }}
</div>
@endif

<table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" width="100%" style="background-color:#f4f4f6;padding:24px 12px;">
    <tr>
        <td align="center">

            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:8px;overflow:hidden;">

                <tr>
                    <td style="padding:20px 32px;border-bottom:1px solid #eef0f3;">
                        <div style="font-size:13px;font-weight:600;color:#666;text-transform:uppercase;letter-spacing:0.06em;">
                            {{ $brandName }}
                        </div>
                    </td>
                </tr>

                @if($post->cover_image_url)
                <tr>
                    <td>
                        <a href="{{ $articleUrl }}" style="display:block;text-decoration:none;">
                            <img src="{{ $post->cover_image_url }}" alt="" width="600" style="display:block;width:100%;max-width:600px;height:auto;">
                        </a>
                    </td>
                </tr>
                @endif

                <tr>
                    <td style="padding:32px 32px 24px;">
                        <h1 style="margin:0 0 16px;font-size:24px;line-height:1.3;color:#111;">
                            <a href="{{ $articleUrl }}" style="color:#111;text-decoration:none;">{{ $post->title }}</a>
                        </h1>
                        @if($excerpt)
                        <p style="margin:0 0 24px;font-size:16px;line-height:1.55;color:#333;">
                            {{ $excerpt }}
                        </p>
                        @endif

                        <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                            <tr>
                                <td style="background-color:#1e6fd9;border-radius:6px;">
                                    <a href="{{ $articleUrl }}" style="display:inline-block;padding:12px 24px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">
                                        Read the full post &rarr;
                                    </a>
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>

                <tr>
                    <td style="padding:24px 32px 28px;border-top:1px solid #eef0f3;font-size:12px;line-height:1.5;color:#888;">
                        You're receiving this because you subscribed to the {{ $brandName }} newsletter.<br>
                        <a href="{{ $unsubscribeUrl }}" style="color:#888;text-decoration:underline;">Unsubscribe</a>
                    </td>
                </tr>

            </table>

        </td>
    </tr>
</table>

</body>
</html>
