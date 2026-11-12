<?php

namespace App\Support;

class UiText
{
    public static function get(string $text, array $replacements = []): string
    {
        $phrases = trans('navigation')['phrases'] ?? [];
        $translated = $phrases[$text] ?? $text;

        return preg_replace_callback('/:([A-Za-z_][A-Za-z0-9_]*)/', fn ($match) =>
            array_key_exists($match[1], $replacements) ? (string) $replacements[$match[1]] : $match[0], $translated);
    }
}
