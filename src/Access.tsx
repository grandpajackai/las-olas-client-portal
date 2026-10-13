import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Platform, Pressable, Switch, View } from "react-native";
import { usePortal } from "./usePortal";
import type { PortalData, Role, User } from "./types";
import {
  Badge,
  Button,
  C,
  Card,
  date,
  Divider,
  Field,
  Icon,
  Label,
  SelectChips,
  T,
} from "./ui";

type AccessUser = User & { active: boolean };
type Invitation = {
  id: string;
  name: string;
  email: string;
  role: Role;
  vesselIds: string[];
  expiresAt: string;
  acceptedAt?: string;
  inviteToken?: string;
};
type AccessData = { users: AccessUser[]; invitations: Invitation[] };
type VesselField = "name" | "model" | "length" | "location" | "program";
const vesselFields: { key: VesselField; label: string; limit: number }[] = [
  { key: "name", label: "Vessel name", limit: 120 },
  { key: "model", label: "Make & model", limit: 120 },
  { key: "length", label: "Length (e.g. 72 ft)", limit: 40 },
  { key: "location", label: "Berth / location", limit: 240 },
  { key: "program", label: "Care program", limit: 120 },
];

export function Access({
  api,
  data,
  notify,
}: {
  api: ReturnType<typeof usePortal>;
  data: PortalData;
  notify: (message: string) => void;
}) {
  const [access, setAccess] = useState<AccessData | null>(null);
  const [accessLoading, setAccessLoading] = useState(true);
  const [accessError, setAccessError] = useState("");
  const [error, setError] = useState("");
  const [invitationErrors, setInvitationErrors] = useState<Record<string, string>>({});
  const [vesselErrors, setVesselErrors] = useState<Partial<Record<VesselField, string>>>({});
  const [vesselError, setVesselError] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("owner");
  const [vesselIds, setVesselIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [addingVessel, setAddingVessel] = useState(false);
  const [vesselForm, setVesselForm] = useState({
    name: "",
    model: "",
    length: "",
    location: "",
    program: "Complete Management",
  });
  const addVessel = async () => {
    if (busy) return;
    const errors: Partial<Record<VesselField, string>> = {};
    for (const { key, label, limit } of vesselFields) {
      if (!vesselForm[key].trim()) errors[key] = `Add ${label.toLowerCase()}.`;
      else if (vesselForm[key].length > limit) errors[key] = `Use ${limit} characters or fewer.`;
    }
    setVesselErrors(errors);
    setVesselError("");
    if (Object.keys(errors).length) return;
    setBusy(true);
    try {
      await api.request(
        "/api/admin/vessels",
        { ...Object.fromEntries(vesselFields.map(({ key }) => [key, vesselForm[key].trim()])), image: "ocean" },
        "POST",
      );
      await api.refresh();
      setAddingVessel(false);
      setVesselForm({
        name: "",
        model: "",
        length: "",
        location: "",
        program: "Complete Management",
      });
      notify("Vessel created. Assign its owners and team below.");
    } catch (e) {
      setVesselError(e instanceof Error ? e.message : "Unable to add this vessel.");
    } finally {
      setBusy(false);
    }
  };
  const refresh = useCallback(async () => {
    setAccessLoading(true);
    setAccessError("");
    try {
      const result = await api.request<AccessData>("/api/admin/access");
      if (!Array.isArray(result?.users) || !Array.isArray(result?.invitations)) throw new Error("Account records could not be loaded. Please try again.");
      setAccess(result);
    } catch (e) {
      setAccessError(
        e instanceof Error ? e.message : "Unable to load access records.",
      );
    } finally {
      setAccessLoading(false);
    }
  }, [api.request]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  const create = async () => {
    if (busy) return;
    setError("");
    const errors: Record<string, string> = {};
    if (!name.trim()) errors.name = "Add a fictional name for this demonstration account.";
    else if (name.length > 120) errors.name = "Use a name with 120 characters or fewer.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || email.length > 254) errors.email = "Enter a valid sample email, such as taylor@example.test.";
    else if (api.demoMode && !/(?:\.test|\.invalid|\.example|@example\.(?:com|net|org))$/i.test(email.trim())) errors.email = "Use a fictional address such as taylor@example.test in this public preview.";
    if (!vesselIds.length && role !== "admin") errors.vessels = "Assign at least one vessel to this account.";
    setInvitationErrors(errors);
    if (Object.keys(errors).length) return;
    setBusy(true);
    try {
      const result = await api.request<Invitation>(
        "/api/admin/invitations",
        { name: name.trim(), email: email.trim(), role, vesselIds },
        "POST",
      );
      setInvitation(result);
      setName("");
      setEmail("");
      setVesselIds([]);
      await refresh();
      notify("Demonstration invitation created. No email was sent.");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Invitation could not be created.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={{ minWidth: 0 }}>
      <Label>Management · authorized fleet access</Label>
      <T serif style={{ fontSize: 35, marginTop: 10 }}>
        The people behind the care.
      </T>
      <T muted style={{ fontSize: 11, marginTop: 8 }}>
        {api.demoMode ? "Manage fictional accounts and vessel access in this browser. Use sample information only; no invitation email is sent." : "Manage assigned vessels and local demonstration accounts. Invitations are one-use tokens with a 48-hour lifetime; delivery is manual in this demo."}
      </T>
      <Button
        label={addingVessel ? "Close vessel form" : "Add a vessel"}
        icon="anchor"
        variant="outline"
        style={{ marginTop: 20, alignSelf: "flex-start" }}
        disabled={busy}
        onPress={() => setAddingVessel(!addingVessel)}
      />
      {!!(addingVessel) && (
        <Card style={{ marginTop: 15, gap: 14 }}>
          {vesselFields.map(
            ({ key, label }) => (
              <View key={key} style={{ gap: 6 }}>
              <Field
                label={api.demoMode && key === "name" ? "Sample vessel name" : label}
                value={vesselForm[key]}
                onChangeText={(value) => {
                  setVesselForm({ ...vesselForm, [key]: value });
                  setVesselErrors((current) => ({ ...current, [key]: undefined }));
                  setVesselError("");
                }}
              />
              {!!(vesselErrors[key]) && <T accessibilityRole="alert" style={{ color: C.red }}>{vesselErrors[key]}</T>}
              </View>
            ),
          )}
          <T muted style={{ fontSize: 10 }}>
            A demonstration yacht image is used until approved vessel
            photography is configured.
          </T>
          {!!(vesselError) && <T accessibilityRole="alert" style={{ color: C.red }}>{vesselError}</T>}
          <Button
            label="Create vessel record"
            icon="plus"
            loading={busy}
            onPress={() => void addVessel()}
          />
        </Card>
      )}
      <T serif style={{ fontSize: 27, marginTop: 27, marginBottom: 13 }}>
        Invite an owner or team member
      </T>
      <Card style={{ gap: 16 }}>
        <T muted>{api.demoMode ? "Fictional names and example.test emails only. These sample accounts stay in this browser; nothing is sent to a yacht company." : "Use fictional details when testing. This demonstration creates a manual token and does not send an email."}</T>
        <View style={{ gap: 6 }}>
        <Field label="Sample full name" value={name} placeholder="Taylor Demo" onChangeText={(value) => { setName(value); setInvitationErrors((current) => ({ ...current, name: "" })); setError(""); }} />
        {!!(invitationErrors.name) && <T accessibilityRole="alert" style={{ color: C.red }}>{invitationErrors.name}</T>}
        </View>
        <View style={{ gap: 6 }}>
        <Field
          label="Sample email address"
          value={email}
          placeholder="taylor@example.test"
          onChangeText={(value) => { setEmail(value); setInvitationErrors((current) => ({ ...current, email: "" })); setError(""); }}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
        />
        {!!(invitationErrors.email) && <T accessibilityRole="alert" style={{ color: C.red }}>{invitationErrors.email}</T>}
        </View>
        <View style={{ gap: 8 }}>
          <Label>Account role</Label>
          <SelectChips
            value={role}
            onChange={(value) => { setRole(value as Role); setInvitationErrors((current) => ({ ...current, vessels: "" })); }}
            options={[
              { value: "owner", label: "Owner / representative" },
              { value: "staff", label: "Assigned staff" },
              { value: "admin", label: "Administrator" },
            ]}
          />
        </View>
        <VesselSelection
          data={data}
          selected={vesselIds}
          onChange={(ids) => { setVesselIds(ids); setInvitationErrors((current) => ({ ...current, vessels: "" })); }}
        />
        {!!(invitationErrors.vessels) && <T accessibilityRole="alert" style={{ color: C.red }}>{invitationErrors.vessels}</T>}
        {role === "admin" && (
          <T style={{ fontSize: 11, color: C.amber }}>
            Administrators can manage the full fleet and all account
            permissions.
          </T>
        )}
        {!!(error) && <T accessibilityRole="alert" style={{ color: C.red }}>{error}</T>}
        <Button
          label="Create demo invitation"
          icon="user-plus"
          loading={busy}
          onPress={() => void create()}
        />
      </Card>
      {!!(invitation) && (
        <Card style={{ marginTop: 16, backgroundColor: C.amberLight }}>
          <Label>One-use invitation token · no email sent</Label>
          <T
            selectable
            style={{ fontSize: 12, marginTop: 10, fontFamily: "DMMedium", ...(Platform.OS === "web" ? { overflowWrap: "anywhere" } : {}) } as any}
          >
            {invitation.inviteToken}
          </T>
          <T muted style={{ fontSize: 11, marginTop: 9 }}>
            For {invitation.email}. Expires {date(invitation.expiresAt, true)}.
            The recipient uses “Use an invitation” on the sign-in screen.
          </T>
        </Card>
      )}
      <T serif style={{ fontSize: 27, marginTop: 28, marginBottom: 13 }}>
        Account & vessel assignments
      </T>
      <View style={{ gap: 14 }}>
        {!!(accessError) && <Card style={{ backgroundColor: C.redLight, gap: 12 }}><T accessibilityRole="alert" style={{ color: C.red }}>{accessError}</T>{!!(access) && <T muted>Showing the last loaded accounts. Retry to see the latest access changes.</T>}<Button label="Retry loading accounts" icon="refresh-cw" variant="outline" loading={accessLoading} onPress={() => void refresh()} /></Card>}
        {access ? (
          access.users.length ? access.users.map((user) => (
            <AccessRow
              key={user.id + user.vesselIds.join(",") + user.active}
              user={user}
              currentId={data.user.id}
              api={api}
              data={data}
              onSaved={() => {
                void refresh();
                void api.refresh();
              }}
              notify={notify}
            />
          )) : <Card style={{ gap: 10 }}><T serif style={{ fontSize: 26 }}>No accounts to display</T><T muted>Create a sample invitation above, or reload the account list.</T><Button label="Reload accounts" variant="outline" loading={accessLoading} onPress={() => void refresh()} /></Card>
        ) : accessLoading ? (
          <View accessibilityRole="progressbar" accessibilityLabel="Loading account and vessel permissions" style={{ alignItems: "center", gap: 12, padding: 20 }}><ActivityIndicator color={C.ink} /><T muted>Loading account access…</T></View>
        ) : !accessError ? (
          <Card style={{ gap: 10 }}><T muted>No account records are available. Reload to try again.</T><Button label="Reload accounts" variant="outline" onPress={() => void refresh()} /></Card>
        ) : null}
        {access && accessLoading && <T accessibilityLiveRegion="polite" muted>Refreshing account access…</T>}
      </View>
      {!!access?.invitations.length && (
        <>
          <T serif style={{ fontSize: 27, marginTop: 28, marginBottom: 13 }}>
            Invitation history
          </T>
          {access.invitations.map((i) => (
            <View
              key={i.id}
              style={{
                paddingVertical: 13,
                borderBottomWidth: 1,
                borderColor: C.line,
              }}
            >
              <T style={{ fontSize: 12 }}>
                {i.name} · {i.role}
              </T>
              <T muted style={{ fontSize: 10, ...(Platform.OS === "web" ? { overflowWrap: "anywhere" } : {}) } as any}>
                {i.email}
              </T>
              <T muted style={{ fontSize: 10 }}>
                {i.acceptedAt
                  ? "Accepted"
                  : new Date(i.expiresAt).getTime() < Date.now()
                    ? "Expired"
                    : "Pending acceptance"}{" "}
                · Expires {date(i.expiresAt, true)}
              </T>
            </View>
          ))}
        </>
      )}
    </View>
  );
}

function VesselSelection({
  data,
  selected,
  onChange,
  disabled = false,
}: {
  data: PortalData;
  selected: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
}) {
  return (
    <View style={{ gap: 9 }}>
      <Label>Assigned vessels</Label>
      <View style={{ gap: 8 }}>
        {data.vessels.map((v) => (
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: selected.includes(v.id), disabled }}
            aria-checked={selected.includes(v.id)}
            accessibilityLabel={`Assign ${v.name}`}
            key={v.id}
            disabled={disabled}
            onPress={() =>
              onChange(
                selected.includes(v.id)
                  ? selected.filter((id) => id !== v.id)
                  : [...selected, v.id],
              )
            }
            style={{
              flexDirection: "row",
              gap: 9,
              minHeight: 48,
              paddingVertical: 10,
              alignItems: "center",
              opacity: disabled ? 0.6 : 1,
            }}
          >
            <View
              style={{
                width: 20,
                height: 20,
                flexShrink: 0,
                borderWidth: 1,
                borderColor: selected.includes(v.id) ? C.ink : C.line,
                backgroundColor: selected.includes(v.id) ? C.ink : C.white,
                borderRadius: 3,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {!!(selected.includes(v.id)) && (
                <Icon name="check" size={14} color={C.white} />
              )}
            </View>
            <T style={{ fontSize: 12, flex: 1, minWidth: 0 }}>{v.name}</T>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
function AccessRow({
  user,
  currentId,
  api,
  data,
  onSaved,
  notify,
}: {
  user: AccessUser;
  currentId: string;
  api: ReturnType<typeof usePortal>;
  data: PortalData;
  onSaved: () => void;
  notify: (message: string) => void;
}) {
  const [ids, setIds] = useState(user.vesselIds);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const update = async (body: Record<string, unknown>) => {
    if (busy) return;
    setError("");
    setBusy(true);
    try {
      await api.request(`/api/admin/users/${user.id}`, body, "PATCH");
      notify(api.demoMode ? "Access updated in this browser demonstration." : "Access updated. Server permissions apply immediately.");
      onSaved();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unable to update this account.";
      setError(message);
      notify(message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 15,
          flexWrap: "wrap",
        }}
      >
        <View style={{ flex: 1, minWidth: 140 }}>
          <T style={{ fontFamily: "DMMedium", fontSize: 12 }}>
            {user.name}
            {user.id === currentId ? " · You" : ""}
          </T>
          <T muted style={{ fontSize: 10, ...(Platform.OS === "web" ? { overflowWrap: "anywhere" } : {}) } as any}>
            {user.email}
          </T>
        </View>
        <Badge
          status={user.active ? "published" : "draft"}
          label={user.active ? user.role : "Revoked"}
        />
      </View>
      <Divider />
      {user.role === "admin" ? (
        <T muted style={{ fontSize: 11 }}>
          Full fleet administrator access
        </T>
      ) : (
        <VesselSelection data={data} selected={ids} onChange={(value) => { setIds(value); setError(""); }} disabled={busy} />
      )}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginTop: 18,
          gap: 15,
          flexWrap: "wrap",
        }}
      >
        <Button
          compact
          label="Save assignments"
          icon="check"
          variant="outline"
          loading={busy}
          disabled={
            user.role === "admin" || ids.join() === user.vesselIds.join()
          }
          onPress={() => void update({ vesselIds: ids })}
        />
        <View style={{ flexDirection: "row", alignItems: "center", gap: 7, minHeight: 48 }}>
          <T muted style={{ fontSize: 13 }}>
            Active
          </T>
          <Switch
            accessibilityLabel={`Active access for ${user.name}`}
            value={user.active}
            disabled={busy || user.id === currentId}
            onValueChange={(active) => void update({ active })}
            trackColor={{ false: "#d5dcd2", true: "#6b8c79" }}
            thumbColor={C.white}
          />
        </View>
      </View>
      {!!(error) && <T accessibilityRole="alert" style={{ color: C.red, marginTop: 12 }}>{error}</T>}
    </Card>
  );
}
