<?php

namespace App\Services;

use App\Models\Order;
use App\Models\RewardHistory;
use App\Models\User;

/** Historical point reversals only; current sales and collections do not earn rewards. */
class LoyaltyService
{
    public function restoreRedeemedPoints(Order $order, string $description = 'Order cancelled'): void
    {
        if ($order->redeemed_points <= 0 || $order->points_restored_at) {
            return;
        }

        $user = $order->user;
        if (! $user) {
            return;
        }

        $user->increment('loyalty_points', (int) $order->redeemed_points);

        RewardHistory::create([
            'user_id' => $user->id,
            'order_id' => $order->id,
            'points' => (int) $order->redeemed_points,
            'type' => 'restore',
            'description' => "{$description}: {$order->order_number}",
        ]);

        $order->forceFill(['points_restored_at' => now()])->save();
        $this->refreshTier($user->fresh());
    }

    public function reverseEarnedPoints(Order $order, string $description = 'Order cancelled'): void
    {
        if ($order->earned_points <= 0 || ! $order->loyalty_awarded_at || ! $order->user) return;

        $user = User::query()->whereKey($order->user_id)->lockForUpdate()->firstOrFail();
        $points = min((int) $order->earned_points, max(0, (int) $user->loyalty_points));
        if ($points > 0) {
            $user->decrement('loyalty_points', $points);
            RewardHistory::create([
                'user_id' => $user->id,
                'order_id' => $order->id,
                'points' => -$points,
                'type' => 'reversal',
                'description' => "{$description}: {$order->order_number}",
            ]);
            $this->refreshTier($user->fresh());
        }
        $order->forceFill(['loyalty_awarded_at' => null, 'earned_points' => 0])->save();
    }

    public function refreshTier(User $user): void
    {
        $points = (int) $user->loyalty_points;
        $tierName = 'Bronze';

        foreach (config('loyalty.tiers', []) as $name => $tier) {
            if ($points >= (int) ($tier['threshold'] ?? 0)) {
                $tierName = $name;
            }
        }

        if ($user->tier !== $tierName) {
            $user->forceFill(['tier' => $tierName])->save();
        }
    }
}
