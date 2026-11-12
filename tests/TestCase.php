<?php

namespace Tests;

use Illuminate\Foundation\Testing\TestCase as BaseTestCase;

abstract class TestCase extends BaseTestCase
{
    use CreatesApplication;

    protected function spreadsheetRows(\Illuminate\Testing\TestResponse $response): array
    {
        $path = tempnam(sys_get_temp_dir(), 'test-xlsx-');
        file_put_contents($path, $response->streamedContent());
        $zip = new \ZipArchive;
        try {
            $this->assertTrue($zip->open($path) === true);
            $sheet = simplexml_load_string($zip->getFromName('xl/worksheets/sheet1.xml'));
            $rows = [];
            foreach ($sheet->sheetData->row as $row) {
                $cells = [];
                foreach ($row->c as $cell) {
                    $cells[] = (string) ($cell['t'] == 'inlineStr' ? $cell->is->t : $cell->v);
                }
                $rows[] = $cells;
            }
            return $rows;
        } finally {
            $zip->close();
            unlink($path);
        }
    }
}
