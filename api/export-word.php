<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/vendor/autoload.php';

use PhpOffice\PhpWord\Element\Table;
use PhpOffice\PhpWord\TemplateProcessor;

header('Cache-Control: no-store');

function fail(int $status, string $message): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(
        ['success' => false, 'message' => $message],
        JSON_UNESCAPED_UNICODE
    );
    exit;
}

function safeText(mixed $value): string
{
    return trim((string) ($value ?? ''));
}

function localPhotoPath(
    string $photo,
    string $projectRoot,
    string $visitKey
): ?string {
    $root = realpath($projectRoot);
    if (!$root) {
        return null;
    }

    $urlPath = parse_url($photo, PHP_URL_PATH);
    $path = rawurldecode(str_replace('\\', '/', $urlPath ?: $photo));
    $filename = basename($path);

    if ($filename === '') {
        return null;
    }

    // La carpeta depende del turno: fotos/inicio o fotos/final.
    $candidates = [
        $root . '/fotos/' . $visitKey . '/' . $filename,
        $root . '/fotos/inicio/' . $filename,
        $root . '/fotos/final/' . $filename,
        $root . '/api/fotos/' . $visitKey . '/' . $filename,
    ];

    foreach ($candidates as $candidate) {
        $real = realpath($candidate);

        if (
            $real !== false &&
            is_file($real) &&
            str_starts_with($real, $root . DIRECTORY_SEPARATOR)
        ) {
            return $real;
        }
    }

    return null;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    fail(405, 'Método no permitido.');
}

$input = json_decode(file_get_contents('php://input'), true);

if (!is_array($input) || !is_array($input['visitData'] ?? null)) {
    fail(400, 'No se recibieron los datos del informe.');
}

$projectRoot = dirname(__DIR__);
$templatePath = $projectRoot . '/plantilla-visita.docx';

if (!is_file($templatePath)) {
    fail(500, 'No se encontró plantilla-visita.docx en la carpeta principal.');
}

$visitName = ($input['currentVisit'] ?? '') === 'final'
    ? 'Final de turno'
    : 'Inicio de turno';

$data = $input['visitData'];
$visitKey = ($input['currentVisit'] ?? '') === 'final' ? 'final' : 'inicio';
$author = safeText($input['author'] ?? '') ?: 'Usuario sin sesión';

$companies = [
    [
        'id' => 'procomit',
        'name' => 'Procomit',
        'sites' => ['Site 3 VHF', 'Sitio Principal', 'Site 1 (mina)', 'Botadero norte'],
    ],
    [
        'id' => 'pascom',
        'name' => 'Claro – Pascom',
        'sites' => ['Torre nueva (CGF)', 'Sitio Campamento'],
    ],
    [
        'id' => 'goldfields',
        'name' => 'GoldFields – NetSoluciones',
        'sites' => ['CGF', 'CAP Site 4', 'Site 3', 'Geología', 'Site 7', 'Área Mina – Site 1'],
    ],
];

try {
    $document = new TemplateProcessor($templatePath);

    $document->setValue('NOMBRE', htmlspecialchars($author, ENT_XML1, 'UTF-8'));
    $document->setValue(
        'FECHA',
        htmlspecialchars(date('d-m-Y'), ENT_XML1, 'UTF-8')
    );

    $content = new Table([
        'borderSize' => 0,
        'cellMargin' => 50,
        'width' => 9000,
    ]);

    $evidence = [];

    foreach ($companies as $company) {
        $companyData = $data[$visitKey][$company['id']] ?? [];

        $content->addRow();
        $content->addCell(9000)->addText(
            $company['name'],
            ['bold' => true, 'size' => 15, 'color' => '24577F'],
            ['spaceBefore' => 240, 'spaceAfter' => 100]
        );

        foreach ($company['sites'] as $site) {
            $status = $companyData['_siteStatus'][$site] ?? [];
            $content->addRow();
            $content->addCell(9000)->addText(
                $site,
                ['bold' => true, 'size' => 12, 'color' => '31536E'],
                ['spaceBefore' => 120, 'spaceAfter' => 60]
            );

            if (!empty($status['notVisited'])) {
                $reason = safeText($status['reason'] ?? '') ?: 'No indicado';
                $content->addRow();
                $content->addCell(9000)->addText(
                    'No visitado. Motivo: ' . $reason,
                    ['bold' => true, 'size' => 10],
                    ['spaceAfter' => 100]
                );
                continue;
            }

            $observations = $companyData[$site] ?? [];

            if (!$observations) {
                $content->addRow();
                $content->addCell(9000)->addText(
                    'Sin observaciones.',
                    ['size' => 10, 'color' => '667788']
                );
                continue;
            }

            foreach ($observations as $observation) {
                $text = safeText($observation['text'] ?? '');
                if ($text === '') {
                    continue;
                }

                $content->addRow();
                $cell = $content->addCell(9000, [
                    'borderLeftSize' => 12,
                    'borderLeftColor' => 'CBD6DF',
                    'borderLeftStyle' => 'single',
                    'marginLeft' => 120,
                ]);

                $cell->addText($text, ['size' => 10]);
                $cell->addText(
                    'Estado: ' . (
                        ($observation['status'] ?? '') === 'solved'
                        ? 'Solucionado'
                        : 'Pendiente'
                    ),
                    ['size' => 9, 'color' => '52697B']
                );
                $timezone = new DateTimeZone('America/Santiago');
                $openedAt = safeText($observation['openedAt'] ?? '');
                $closedAt = safeText($observation['closedAt'] ?? '');
                $isSolved = ($observation['status'] ?? '') === 'solved';

                $openedDate = $openedAt !== ''
                    ? DateTimeImmutable::createFromFormat('!Y-m-d', $openedAt, $timezone)
                    : false;

                $endAt = $isSolved
                    ? $closedAt
                    : (new DateTimeImmutable('today', $timezone))->format('Y-m-d');

                $endDate = $endAt !== ''
                    ? DateTimeImmutable::createFromFormat('!Y-m-d', $endAt, $timezone)
                    : false;

                $cell->addText(
                    'Fecha de apertura: ' . (
                        $openedDate ? $openedDate->format('d-m-Y') : 'Sin registrar'
                    ),
                    ['size' => 9, 'color' => '52697B']
                );

                if ($openedDate && $endDate) {
                    $daysOpen = $openedDate->diff($endDate)->days;
                    $label = $isSolved ? 'Duración hasta cierre: ' : 'Días abierta: ';

                    $cell->addText(
                        $label . $daysOpen . ' días',
                        ['size' => 9, 'color' => '52697B']
                    );
                } else {
                    $message = $openedDate
                        ? 'Falta registrar la fecha de cierre'
                        : 'Falta registrar la fecha de apertura';

                    $cell->addText(
                        $message,
                        ['size' => 9, 'color' => '52697B']
                    );
                }

                $comment = safeText($observation['comment'] ?? '');
                if ($comment !== '') {
                    $cell->addText(
                        'Comentario: ' . $comment,
                        ['size' => 9, 'color' => '626B73'],
                        ['bgColor' => 'F1F3F5']
                    );
                }

                $photo = safeText($observation['photo'] ?? '');
                if ($photo !== '') {
                    $localPath = localPhotoPath($photo, $projectRoot, $visitKey);
                    if ($localPath) {
                        $evidence[] = [
                            'company' => $company['name'],
                            'site' => $site,
                            'text' => $text,
                            'path' => $localPath,
                        ];
                    }
                }
            }
        }
    }


    $document->setComplexBlock('CONTENIDO', $content);
    $photoPages = array_chunk($evidence, 4);

    if (count($photoPages) === 0) {
        $photoPages = [[]];
    }

    $document->cloneBlock('FOTOS', count($photoPages), true, true);

    foreach ($photoPages as $pageIndex => $pagePhotos) {
        $pageNumber = $pageIndex + 1;

        for ($slot = 1; $slot <= 4; $slot++) {
            $photo = $pagePhotos[$slot - 1] ?? null;
            $imageMacro = 'FOTO' . $slot . '#' . $pageNumber;
            $captionMacro = 'PIE' . $slot . '#' . $pageNumber;

            if (!$photo || empty($photo['path'])) {
                $document->setValue($imageMacro, '');
                $document->setValue($captionMacro, '');
                continue;
            }

            $photoPath = $photo['path'];

            if ($photoPath[0] !== '/') {
                $photoPath = dirname(__DIR__) . '/' . ltrim($photoPath, './');
            }

            $photoPath = realpath($photoPath);

            if (!$photoPath || !is_file($photoPath)) {
                error_log('Foto no encontrada para Word: ' . $photo['path']);
                $document->setValue($imageMacro, '');
                $document->setValue($captionMacro, '');
                continue;
            }

            $size = @getimagesize($photoPath);

            if (!$size) {
                error_log('PHPWord no reconoce la foto: ' . $photoPath);
                $document->setValue($imageMacro, '');
                $document->setValue($captionMacro, '');
                continue;
            }

            $scale = min(320 / $size[0], 300 / $size[1], 1);

            $document->setImageValue($imageMacro, [
                'path' => $photoPath,
                'width' => max(1, (int) round($size[0] * $scale)),
                'height' => max(1, (int) round($size[1] * $scale)),
            ]);

            $caption = trim(
                ($photo['company'] ?? '') . ' · ' .
                ($photo['site'] ?? '') . ' — ' .
                ($photo['text'] ?? '')
            );

            $document->setValue($captionMacro, $caption);
        }
    }
    $temporaryFile = tempnam(sys_get_temp_dir(), 'visita_');
    $document->saveAs($temporaryFile);

    $week = (int) ($data['semana'] ?? 0);
    $filename = 'Visita ' . $visitName . ' - Semana ' . $week . '.docx';

    header(
        'Content-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );
    header('Content-Disposition: attachment; filename="' . $filename . '"');
    header('Content-Length: ' . filesize($temporaryFile));

    readfile($temporaryFile);
    unlink($temporaryFile);
    exit;
} catch (Throwable $error) {
    error_log('Error al exportar visita: ' . $error->getMessage());
    fail(500, 'No se pudo crear el Word. Revisa el registro de errores de PHP.');
}