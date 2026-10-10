<?php
declare(strict_types=1);

namespace Tai;

/** Error con código HTTP que la API traduce a {"error": "..."}. */
final class ApiError extends \RuntimeException
{
    public function __construct(public readonly int $status, string $message)
    {
        parent::__construct($message);
    }
}
