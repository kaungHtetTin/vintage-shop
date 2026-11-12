<?php

require __DIR__.'/../vendor/autoload.php';
$app = require __DIR__.'/../bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
if (! app()->environment('testing') || Illuminate\Support\Facades\DB::connection()->getDatabaseName() !== 'music_store_testing') {
    throw new RuntimeException('Browser fixtures are restricted to music_store_testing.');
}
$suffix = Illuminate\Support\Str::lower(Illuminate\Support\Str::random(8));
$password = Illuminate\Support\Str::random(32);
$user = App\Models\User::factory()->create(['name' => 'Vintage workflow tester', 'email' => 'bale-'.$suffix.'@example.invalid', 'password' => Illuminate\Support\Facades\Hash::make($password), 'role' => 'super_admin', 'status' => 'active']);
$location = App\Models\Location::create(['code' => 'UI-'.strtoupper($suffix), 'name' => 'Vintage test shop '.$suffix, 'type' => 'warehouse', 'is_active' => true]);
file_put_contents(storage_path('framework/bale-browser-session.json'), json_encode(['email' => $user->email, 'password' => $password, 'location_id' => $location->id, 'supplier_name' => 'Vintage supplier '.$suffix]));
echo "Prepared isolated browser fixtures in music_store_testing.\n";
