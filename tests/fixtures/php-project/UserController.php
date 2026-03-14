<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Services\UserService;
use App\Contracts\Transformable;
use App\Http\Requests\CreateUserRequest;
use App\Http\Requests\UpdateUserRequest;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Cache;

class UserController extends Controller implements Transformable
{
    use HasPagination;
    use HasJsonResponse;

    private UserService $userService;

    public function __construct(UserService $userService)
    {
        $this->userService = $userService;
        $this->middleware('auth')->except(['index', 'show']);
    }

    /**
     * Display a listing of users.
     */
    public function index(Request $request): JsonResponse
    {
        $page = $request->input('page', 1);
        $perPage = $request->input('per_page', 15);

        $users = Cache::remember(
            "users.page.{$page}",
            now()->addMinutes(10),
            fn () => $this->userService->paginate($page, $perPage)
        );

        return $this->successResponse($users, 'Users retrieved successfully');
    }

    /**
     * Display the specified user.
     */
    public function show(string $id): JsonResponse
    {
        $user = $this->userService->findById($id);

        if (!$user) {
            return $this->errorResponse('User not found', 404);
        }

        return $this->successResponse(
            $this->transform($user),
            'User retrieved successfully'
        );
    }

    /**
     * Store a newly created user.
     */
    public function store(CreateUserRequest $request): JsonResponse
    {
        $validated = $request->validated();

        try {
            $user = $this->userService->create($validated);
            Log::info('User created', ['id' => $user->id]);

            return $this->successResponse(
                $this->transform($user),
                'User created successfully',
                201
            );
        } catch (\Exception $e) {
            Log::error('Failed to create user', ['error' => $e->getMessage()]);
            return $this->errorResponse('Failed to create user', 500);
        }
    }

    /**
     * Update the specified user.
     */
    public function update(UpdateUserRequest $request, string $id): JsonResponse
    {
        $user = $this->userService->findById($id);

        if (!$user) {
            return $this->errorResponse('User not found', 404);
        }

        $updated = $this->userService->update($user, $request->validated());
        Cache::forget("users.page.*");

        return $this->successResponse(
            $this->transform($updated),
            'User updated successfully'
        );
    }

    /**
     * Remove the specified user.
     */
    public function destroy(string $id): JsonResponse
    {
        $user = $this->userService->findById($id);

        if (!$user) {
            return $this->errorResponse('User not found', 404);
        }

        $this->userService->delete($user);
        Cache::forget("users.page.*");
        Log::info('User deleted', ['id' => $id]);

        return $this->successResponse(null, 'User deleted successfully');
    }

    /**
     * Transform a user model for API response.
     */
    public function transform(mixed $model): array
    {
        return [
            'id' => $model->id,
            'name' => $model->name,
            'email' => $model->email,
            'role' => $model->role,
            'created_at' => $model->created_at->toIso8601String(),
        ];
    }

    /**
     * Bulk import users from a CSV file.
     */
    protected function importFromCsv(string $filePath): int
    {
        $count = 0;
        $handle = fopen($filePath, 'r');

        while (($row = fgetcsv($handle)) !== false) {
            $this->userService->create([
                'name' => $row[0],
                'email' => $row[1],
                'role' => $row[2] ?? 'viewer',
            ]);
            $count++;
        }

        fclose($handle);
        return $count;
    }

    private function formatValidationErrors(array $errors): array
    {
        return collect($errors)
            ->map(fn ($messages, $field) => [
                'field' => $field,
                'messages' => $messages,
            ])
            ->values()
            ->toArray();
    }
}
