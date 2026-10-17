import { useMemberLocale } from "./locale";
export function MemberIdentity({
  id,
  profile,
}: {
  id: string;
  profile?: Record<string, any>;
}) {
  const { t } = useMemberLocale();
  return (
    <span className="affiliate-member-identity">
      <strong>{profile?.display_name || id}</strong>
      <small>
        ID: {profile?.display_id || id} ·{" "}
        {profile?.vip_level == null
          ? t("VIP未提供")
          : "VIP" + profile.vip_level}
      </small>
    </span>
  );
}
