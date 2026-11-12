<?php

// Source migration utility: localize response text without touching stored business data.
require __DIR__.'/../vendor/autoload.php';

$parser = (new PhpParser\ParserFactory)->createForNewestSupportedVersion();
$catalogue = [];
$apply = in_array('--apply', $argv, true);
$roots = ['app/Http/Controllers', 'app/Http/Middleware', 'app/Services'];
foreach ($roots as $root) {
    foreach (new RecursiveIteratorIterator(new RecursiveDirectoryIterator($root)) as $file) {
        if ($file->getExtension() !== 'php') continue;
        $source = file_get_contents($file->getPathname());
        $changes = [];
        $walk = function ($node, bool $message = false) use (&$walk, &$changes, &$catalogue, $source) {
            if (is_array($node)) { foreach ($node as $item) $walk($item, $message); return; }
            if (! $node instanceof PhpParser\Node) return;
            if ($node instanceof PhpParser\Node\Expr\FuncCall && $node->name instanceof PhpParser\Node\Name && in_array((string) $node->name, ['__', 'trans', 'App\\Support\\UiText::get'])) return;
            if ($node instanceof PhpParser\Node\Expr\StaticCall && $node->class instanceof PhpParser\Node\Name && (string) $node->class === 'App\\Support\\UiText') return;
            if ($node instanceof PhpParser\Node\Scalar\String_ && $message && preg_match('/[A-Za-z]{2}/', $node->value)) {
                $catalogue[$node->value] = $node->value;
                $changes[] = [$node->getStartFilePos(), $node->getEndFilePos() + 1, '\\App\\Support\\UiText::get('.substr($source, $node->getStartFilePos(), $node->getEndFilePos() - $node->getStartFilePos() + 1).')'];
                return;
            }
            if ($message && $node instanceof PhpParser\Node\Scalar\InterpolatedString) {
                $key = '';
                $parameters = [];
                foreach ($node->parts as $part) {
                    if ($part instanceof PhpParser\Node\InterpolatedStringPart) {
                        $key .= $part->value;
                    } else {
                        $name = 'value'.(count($parameters) + 1);
                        $key .= ':'.$name;
                        $parameters[] = var_export($name, true).' => '.substr($source, $part->getStartFilePos(), $part->getEndFilePos() - $part->getStartFilePos() + 1);
                    }
                }
                $catalogue[$key] = $key;
                $changes[] = [$node->getStartFilePos(), $node->getEndFilePos() + 1, '\\App\\Support\\UiText::get('.var_export($key, true).', ['.implode(', ', $parameters).'])'];
                return;
            }
            if ($message && $node instanceof PhpParser\Node\Expr\Ternary) {
                $walk($node->cond, false);
                $walk($node->if, true);
                $walk($node->else, true);
                return;
            }
            if ($message && $node instanceof PhpParser\Node\Expr\FuncCall && $node->name instanceof PhpParser\Node\Name && (string) $node->name === 'sprintf') {
                foreach ($node->args as $index => $arg) $walk($arg->value, $index === 0);
                return;
            }
            if ($message && ! $node instanceof PhpParser\Node\ArrayItem && ! $node instanceof PhpParser\Node\Expr\Array_ && ! $node instanceof PhpParser\Node\Expr\BinaryOp\Concat) $message = false;
            if ($node instanceof PhpParser\Node\ArrayItem) {
                $walk($node->value, $message || ($node->key instanceof PhpParser\Node\Scalar\String_ && in_array($node->key->value, ['message', 'success', 'error'])));
                return;
            }
            if ($node instanceof PhpParser\Node\Expr\MethodCall || $node instanceof PhpParser\Node\Expr\StaticCall) {
                $name = $node->name instanceof PhpParser\Node\Identifier ? $node->name->name : '';
                if ($name === 'withMessages') { foreach ($node->args as $arg) $walk($arg->value, true); return; }
                if ($name === 'with' && isset($node->args[1]) && $node->args[0]->value instanceof PhpParser\Node\Scalar\String_ && in_array($node->args[0]->value->value, ['success', 'error'])) {
                    $walk($node->args[1]->value, true);
                    return;
                }
            }
            if ($node instanceof PhpParser\Node\Expr\FuncCall && $node->name instanceof PhpParser\Node\Name && in_array((string) $node->name, ['abort', 'abort_if', 'abort_unless'])) {
                $index = (string) $node->name === 'abort' ? 1 : 2;
                if (isset($node->args[$index])) $walk($node->args[$index]->value, true);
                return;
            }
            foreach ($node->getSubNodeNames() as $name) $walk($node->$name, $message);
        };
        $walk($parser->parse($source));
        if ($apply && $changes) {
            usort($changes, fn ($a, $b) => $b[0] <=> $a[0]);
            foreach ($changes as [$start, $end, $text]) $source = substr($source, 0, $start).$text.substr($source, $end);
            file_put_contents($file->getPathname(), $source);
        }
    }
}
ksort($catalogue);
file_put_contents('artifacts/server-ui-inventory.json', json_encode($catalogue, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
echo count($catalogue)." server message fragments inventoried.\n";
