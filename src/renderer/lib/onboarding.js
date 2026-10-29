import { supabase } from "./supabase";

export async function getOnboarding(userId) {
  const [{ data: onboarding, error }, { data: notifications }] =
    await Promise.all([
      supabase
        .from("member_onboarding_preferences")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle(),
      supabase
        .from("member_notification_preferences")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle(),
    ]);
  if (error) throw error;
  return { onboarding, notifications };
}

export async function saveOnboarding(userId, values, skipped = false) {
  const updatedAt = new Date().toISOString();
  const onboarding = {
    user_id: userId,
    favorite_games: values.favoriteGames,
    vrchat_interests: values.vrchatInterests,
    time_zone: values.timeZone || null,
    typical_availability: values.typicalAvailability || null,
    selected_sections: values.selectedSections,
    selected_walkthroughs: values.selectedWalkthroughs,
    notification_defaults: values.notifications,
    friend_recommendations_enabled: values.recommendations,
    preferred_contact_method: values.preferredContact || null,
    completed_at: skipped ? null : updatedAt,
    skipped_at: skipped ? updatedAt : null,
    updated_at: updatedAt,
  };
  const results = await Promise.all([
    supabase
      .from("member_onboarding_preferences")
      .upsert(onboarding, { onConflict: "user_id" }),
    supabase.from("member_notification_preferences").upsert(
      { user_id: userId, ...values.notifications, updated_at: updatedAt },
      { onConflict: "user_id" },
    ),
    supabase.from("friend_feature_settings").upsert(
      {
        user_id: userId,
        recommendations_enabled: values.recommendations,
        updated_at: updatedAt,
      },
      { onConflict: "user_id" },
    ),
  ]);
  const error = results.find((result) => result.error)?.error;
  if (error) throw error;
  return onboarding;
}

export async function getOnboardingRecommendations(limit = 8) {
  const { data, error } = await supabase.rpc(
    "get_onboarding_member_recommendations",
    { result_limit: limit },
  );
  if (error) throw error;
  return data || [];
}
