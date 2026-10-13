import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  ImageBackground,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar,
  Switch,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { useFonts } from "expo-font";
import Feather from "@expo/vector-icons/Feather";
import { LinearGradient } from "expo-linear-gradient";
import * as ImagePicker from "expo-image-picker";
import { usePortal } from "./src/usePortal";
import { Access } from "./src/Access";
import {
  Attachment,
  Check,
  CheckStatus,
  Estimate,
  PortalData,
  Report,
  ServiceRequest,
  Vessel,
  Visit,
} from "./src/types";
import {
  Badge,
  Button,
  C,
  Card,
  date,
  Divider,
  DateField,
  Empty,
  Field,
  Icon,
  IconName,
  Label,
  money,
  s,
  SectionHeading,
  SelectChips,
  T,
  Wordmark,
} from "./src/ui";

type Page =
  | "Home"
  | "Service history"
  | "Requests"
  | "Approvals"
  | "Schedule"
  | "Documents"
  | "Account"
  | "Workspace"
  | "More";
type Detail =
  | { kind: "report" | "request" | "estimate" | "visit"; id: string }
  | {
      kind:
        | "new-request"
        | "new-report"
        | "new-estimate"
        | "new-visit"
        | "notifications"
        | "vessels"
        | "access";
      requestId?: string;
      supersedesId?: string;
      intent?: "arrival";
    };
type Portal = ReturnType<typeof usePortal>;
type Context = {
  api: Portal;
  data: PortalData;
  vessel: Vessel;
  page: Page;
  navigate: (page: Page) => void;
  open: (detail: Detail) => void;
  notify: (text: string) => void;
  markDirty: (dirty: boolean) => void;
  wide: boolean;
};
const photos = {
  ocean:
    Platform.OS === "web"
      ? require("./assets/ocean-hero.webp")
      : require("./assets/ocean-hero-native.png"),
  detail:
    Platform.OS === "web"
      ? require("./assets/yacht-detail.webp")
      : require("./assets/yacht-detail-native.png"),
};
const categories = [
  "Maintenance & systems",
  "Exterior detailing",
  "Interior care",
  "Project management",
  "Captain & crew",
  "Yacht concierge",
  "Hurricane planning",
];
const nav: { page: Page; icon: IconName }[] = [
  { page: "Home", icon: "grid" },
  { page: "Service history", icon: "clipboard" },
  { page: "Requests", icon: "message-square" },
  { page: "Approvals", icon: "check-circle" },
  { page: "Schedule", icon: "calendar" },
  { page: "Documents", icon: "folder" },
];

export default function App() {
  const [loaded, fontError] = useFonts({
    DM: require("./assets/sans-regular.ttf"),
    DMMedium: require("./assets/sans-medium.ttf"),
    Cormorant: require("./assets/serif-regular.ttf"),
    CormorantItalic: require("./assets/serif-italic.ttf"),
    ...Feather.font,
  });
  if (!loaded && !fontError)
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: C.paper,
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <ActivityIndicator color={C.ink} />
        <T style={{ marginTop: 12 }}>Preparing your portal…</T>
      </View>
    );
  return (
    <SafeAreaProvider>
      <PortalApp />
    </SafeAreaProvider>
  );
}

function PortalApp() {
  const api = usePortal();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const wide = width >= 1000;
  const [page, setPage] = useState<Page>("Home");
  const [vesselId, setVesselId] = useState("");
  const [detail, setDetail] = useState<Detail | null>(null);
  const [toast, setToast] = useState("");
  const [dirty, setDirty] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [pendingDetail,setPendingDetail]=useState<Detail|null>(null);
  useEffect(() => {
    setDirty(false);
    setConfirmClose(false);
  }, [detail]);
  const closeDialog=()=>{setPendingDetail(null);dirty?setConfirmClose(true):setDetail(null);};
  const openDialog=(next:Detail)=>{if(dirty){setPendingDetail(next);setConfirmClose(true);}else setDetail(next);};
  useEffect(()=>{if(Platform.OS!=="web"||!dirty)return;const prevent=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue="";};window.addEventListener("beforeunload",prevent);return()=>window.removeEventListener("beforeunload",prevent);},[dirty]);
  const data = api.data;
  useEffect(() => {
    setPage(data?.user.role === "owner" ? "Home" : "Workspace");
    setDetail(null);
    setToast("");
  }, [data?.user.id]);
  useEffect(() => {
    if (data && !data.vessels.some((v) => v.id === vesselId))
      setVesselId(data.vessels[0]?.id || "");
  }, [data?.user.id, data?.vessels, vesselId]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 5500);
    return () => clearTimeout(timer);
  }, [toast]);
  const navigate = (p: Page) => {
    setPage(p);
    setDetail(null);
  };
  if (api.sessionLoading)
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: C.paper,
          justifyContent: "center",
          alignItems: "center",
          gap: 20,
        }}
      >
        <Wordmark />
        <ActivityIndicator color={C.ink} />
      </View>
    );
  if (!data) return <Login api={api} wide={wide} />;
  const vessel = data.vessels.find((v) => v.id === vesselId) || data.vessels[0];
  if (!vessel)
    return (
      <View
        style={{
          flex: 1,
          padding: 30,
          justifyContent: "center",
          backgroundColor: C.paper,
        }}
      >
        <Empty
          title="Your invitation is ready"
          detail="No vessels are assigned to this account yet. Your administrator can arrange vessel access."
        />
        <Button
          label="Sign out"
          onPress={() => void api.logout()}
          variant="ghost"
        />
        {!!(api.demoMode) && (
          <Button
            label="Reset demonstration"
            variant="outline"
            onPress={() => void api.resetDemo().catch((e) => api.clearError())}
          />
        )}
        {!!(api.error) && (
          <T accessibilityRole="alert" style={{ color: C.red }}>
            {api.error}
          </T>
        )}
      </View>
    );
  const ctx: Context = {
    api,
    data,
    vessel,
    page,
    navigate,
    open: openDialog,
    notify: (text) => setToast(api.demoMode?"Demo · "+text:text),
    markDirty: setDirty,
    wide,
  };
  const isStaff = data.user.role !== "owner";
  const pendingCount = data.estimates.filter(
    (e) =>
      e.vesselId === vessel.id && e.status === "pending" && !e.supersededBy,
  ).length;
  const unread = data.notifications.filter((n) => !n.read).length;
  const navItems = isStaff
    ? [{ page: "Workspace" as Page, icon: "layers" as IconName }, ...nav]
    : nav;
  const bottomItems: { page: Page; icon: IconName }[] = isStaff
    ? [
        { page: "Workspace", icon: "layers" },
        { page: "Requests", icon: "message-square" },
        { page: "Service history", icon: "clipboard" },
        { page: "More", icon: "more-horizontal" },
      ]
    : [nav[0], nav[1], nav[2], { page: "More", icon: "more-horizontal" }];
  const tabSelected = (target: Page) =>
    target === page ||
    (target === "More" &&
      ["Approvals", "Schedule", "Documents", "Account"].includes(page));
  return (
    <View style={{ flex: 1, backgroundColor: C.paper, paddingTop: insets.top }}>
      <StatusBar barStyle="dark-content" backgroundColor={C.paper} />
      <View
        style={{
          backgroundColor: "#e9e9de",
          paddingVertical: 6,
          paddingHorizontal: 16,
          alignItems: "center",
        }}
      >
        <T
          style={{
            fontSize: 10,
            lineHeight: 15,
            color: "#5b655c",
            letterSpacing: 0.3,
          }}
        >
          {api.demoMode
            ? "INTERACTIVE PREVIEW · Fictional vessels & records"
            : "DEMONSTRATION PORTAL · Sample vessels & records"}
        </T>
      </View>
      <View style={{ flex: 1, flexDirection: "row" }}>
        {!!(wide) && (
          <View
            style={{
              width: 236,
              backgroundColor: C.deep,
              padding: 26,
              paddingTop: 32,
              justifyContent: "space-between",
            }}
          >
            <View>
              <Wordmark light />
              <View
                style={{
                  width: 32,
                  height: 1,
                  backgroundColor: C.gold,
                  marginVertical: 28,
                }}
              />
              <Label
                style={{ color: "#8ea9a7", fontSize: 8, marginBottom: 16 }}
              >
                {isStaff ? "Fleet workspace" : "Your ownership, simplified"}
              </Label>
              {navItems.map((item) => (
                <Pressable
                  key={item.page}
                  accessibilityRole="button"
                  accessibilityState={{ selected: page === item.page }}
                  onPress={() => navigate(item.page)}
                  style={({ hovered }: any) => [
                    {
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 12,
                      paddingVertical: 13,
                      paddingHorizontal: 12,
                      borderRadius: 5,
                      marginHorizontal: -8,
                      marginBottom: 5,
                      backgroundColor:
                        page === item.page
                          ? "#154149"
                          : hovered
                            ? "#10373c"
                            : "transparent",
                    },
                  ]}
                >
                  <Icon
                    name={item.icon}
                    size={17}
                    color={page === item.page ? C.gold : "#99b0ae"}
                  />
                  <T
                    style={{
                      fontSize: 12,
                      color: page === item.page ? C.white : "#b4c6c2",
                    }}
                  >
                    {item.page}
                  </T>
                  {item.page === "Approvals" && pendingCount > 0 ? (
                    <View
                      style={{
                        marginLeft: "auto",
                        backgroundColor: C.gold,
                        borderRadius: 3,
                        paddingHorizontal: 5,
                      }}
                    >
                      <T style={{ fontSize: 9 }}>{pendingCount}</T>
                    </View>
                  ) : null}
                </Pressable>
              ))}
            </View>
            <View>
              <View
                style={{
                  borderTopWidth: 1,
                  borderColor: "#21464a",
                  paddingTop: 21,
                  marginBottom: 22,
                }}
              >
                <Icon name="anchor" color={C.gold} size={19} />
                <T
                  serif
                  style={{ color: C.paper, fontSize: 22, marginTop: 12 }}
                >
                  A considered way{"\n"}to own a yacht.
                </T>
                <T style={{ fontSize: 10, color: "#93aaa5", marginTop: 8 }}>
                  FORT LAUDERDALE, FLORIDA
                </T>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Account settings"
                onPress={() => navigate("Account")}
                style={s.row}
              >
                <Avatar text={data.user.initials} light />
                <View>
                  <T style={{ color: C.paper, fontSize: 11 }}>
                    {data.user.name}
                  </T>
                  <T
                    style={{
                      color: "#94aba6",
                      fontSize: 10,
                      textTransform: "capitalize",
                    }}
                  >
                    {data.user.role} account
                  </T>
                </View>
                <Icon name="settings" color="#94aba6" size={15} />
              </Pressable>
            </View>
          </View>
        )}
        <View style={{ flex: 1 }}>
          <View
            style={{
              height: wide ? 78 : 67,
              paddingHorizontal: wide ? 38 : 20,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              borderBottomWidth: 1,
              borderColor: C.line,
              backgroundColor: C.white,
            }}
          >
            {wide ? (
              <View style={s.row}>
                <Label>Client portal</Label>
                <T muted>/</T>
                <T style={{ fontSize: 12 }}>{page}</T>
              </View>
            ) : (
              <T serif style={{ fontSize: 25, letterSpacing: 1 }}>
                LAS OLAS
              </T>
            )}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: wide ? 23 : 16,
              }}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Switch vessel. Selected ${vessel.name}`}
                onPress={() => setDetail({ kind: "vessels" })}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                  minHeight: 44,
                }}
              >
                <Icon name="anchor" size={15} color={C.goldDark} />
                <T
                  numberOfLines={1}
                  style={{
                    fontSize: 12,
                    maxWidth: width < 700 ? 110 : 220,
                    flexShrink: 1,
                  }}
                >
                  {vessel.name}
                </T>
                <Icon name="chevron-down" size={13} />
              </Pressable>
              <View style={{ width: 1, height: 24, backgroundColor: C.line }} />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Notifications, ${unread} unread`}
                onPress={() => setDetail({ kind: "notifications" })}
                style={{
                  minWidth: 44,
                  minHeight: 44,
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <Icon name="bell" size={19} />
                {unread > 0 && (
                  <View
                    style={{
                      position: "absolute",
                      top: 10,
                      right: 4,
                      width: 6,
                      height: 6,
                      borderRadius: 4,
                      backgroundColor: C.goldDark,
                      borderWidth: 1,
                      borderColor: C.white,
                    }}
                  />
                )}
              </Pressable>
              {!!(wide) && <Avatar text={data.user.initials} />}
            </View>
          </View>
          {!!((api.error ||
            api.pending.length > 0 ||
            !api.online ||
            api.offlineMode)) && (
            <View
              style={{
                paddingHorizontal: wide ? 38 : 20,
                paddingVertical: 9,
                backgroundColor: api.error ? C.redLight : C.amberLight,
                flexDirection: "row",
                gap: 10,
                alignItems: "center",
              }}
            >
              <Icon
                name={api.error ? "alert-circle" : "cloud-off"}
                size={16}
                color={api.error ? C.red : C.amber}
              />
              <T
                style={{
                  flex: 1,
                  fontSize: 11,
                  color: api.error ? C.red : C.amber,
                }}
              >
                {api.error ||
                  `${api.offlineMode || !api.online ? "Offline · Showing last synchronized records. " : ""}${api.pending.length ? `${api.pending.length} field ${api.pending.length === 1 ? "entry" : "entries"} pending sync.` : ""}`}
              </T>
              <Button
                compact
                variant="ghost"
                label={api.error ? "Dismiss" : "Sync"}
                onPress={() =>
                  api.error
                    ? api.clearError()
                    : api.offlineMode
                      ? api.setOfflineMode(false)
                      : void api.refresh()
                }
              />
            </View>
          )}
          <ScrollView
            key={`${page}-${vessel.id}`}
            style={{ flex: 1 }}
            contentContainerStyle={{
              padding: wide ? 38 : 20,
              paddingBottom: 36,
              maxWidth: 1440,
              width: "100%",
              alignSelf: "center",
            }}
            refreshControl={
              <RefreshControl
                refreshing={api.loading}
                onRefresh={() => void api.refresh()}
                tintColor={C.ink}
              />
            }
          >
            {page === "Home" && <Home {...ctx} />}
            {page === "Service history" && <History {...ctx} />}
            {page === "Requests" && <Requests {...ctx} />}
            {page === "Approvals" && <Approvals {...ctx} />}
            {page === "Schedule" && <Schedule {...ctx} />}
            {page === "Documents" && <Documents {...ctx} />}
            {page === "Account" && <Account {...ctx} />}
            {page === "More" && <More {...ctx} />}
            {page === "Workspace" && isStaff && <Workspace {...ctx} />}
            <View
              style={{
                borderTopWidth: 1,
                borderColor: C.line,
                marginTop: 36,
                paddingTop: 17,
                flexDirection: "row",
                flexWrap: "wrap",
                justifyContent: "space-between",
                gap: 8,
              }}
            >
              <T muted style={{ fontSize: 9 }}>
                LAS OLAS YACHT MANAGEMENT ·{" "}
                {data.user.role === "owner"
                  ? "A clearer picture of your yacht."
                  : "Every detail, accounted for."}
              </T>
              <T muted style={{ fontSize: 9 }}>
                Synced{" "}
                {api.lastSynced
                  ? new Date(api.lastSynced).toLocaleTimeString("en-US", {
                      hour: "numeric",
                      minute: "2-digit",
                      timeZone: "America/New_York",
                    }) + " ET"
                  : "—"}{" "}
                · Staff-reported observations
              </T>
            </View>
          </ScrollView>
          {!wide && (
            <View
              style={{
                flexDirection: "row",
                backgroundColor: C.white,
                borderTopWidth: 1,
                borderColor: C.line,
                paddingBottom: Math.max(insets.bottom, 9),
                paddingTop: 9,
              }}
            >
              {bottomItems.map((item) => (
                <Pressable
                  key={item.page}
                  accessibilityRole="button"
                  accessibilityLabel={item.page}
                  accessibilityState={{ selected: tabSelected(item.page) }}
                  onPress={() => navigate(item.page)}
                  style={{
                    flex: 1,
                    alignItems: "center",
                    gap: 4,
                    minHeight: 48,
                  }}
                >
                  <Icon
                    name={item.icon}
                    size={20}
                    color={tabSelected(item.page) ? C.ink : C.muted}
                  />
                  <T
                    style={{
                      fontSize: 11,
                      color: tabSelected(item.page) ? C.ink : C.muted,
                    }}
                  >
                    {item.page === "Service history" ? "History" : item.page}
                  </T>
                </Pressable>
              ))}
            </View>
          )}
        </View>
      </View>
      {!!toast && (
        <View
          accessibilityRole="alert"
          style={{
            position: "absolute",
            bottom: wide ? 28 : 92,
            alignSelf: "center",
            maxWidth: "90%",
            backgroundColor: C.ink,
            borderRadius: 6,
            paddingHorizontal: 22,
            paddingVertical: 13,
            flexDirection: "row",
            gap: 10,
            alignItems: "center",
          }}
        >
          <Icon name="info" color={C.gold} size={18} />
          <T style={{ color: C.white, fontSize: 12, flexShrink: 1 }}>{toast}</T>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Dismiss message"
            onPress={() => setToast("")}
            style={{
              minWidth: 44,
              minHeight: 44,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name="x" color={C.white} size={18} />
          </Pressable>
        </View>
      )}
      <Modal
        visible={detail !== null}
        transparent
        animationType="fade"
        onRequestClose={closeDialog}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "#062f3577",
            justifyContent: "center",
            alignItems: "center",
            padding: width < 700 ? 10 : 30,
            paddingTop: Math.max(insets.top, 20),
            paddingBottom: Math.max(insets.bottom, 20),
          }}
        >
          <View
            accessibilityViewIsModal
            role={Platform.OS === "web" ? "dialog" : undefined}
            accessibilityLabel="Las Olas portal dialog"
            style={{
              backgroundColor: C.paper,
              borderRadius: 10,
              width: "100%",
              maxWidth: 690,
              maxHeight: "95%",
            }}
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                paddingHorizontal: 25,
                paddingVertical: 15,
                borderBottomWidth: 1,
                borderColor: C.line,
              }}
            >
              <Label>
                Las Olas ·{" "}
                {detail?.kind.includes("new")
                  ? "Create a record"
                  : "Your portal"}
              </Label>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close dialog"
                onPress={closeDialog}
                style={{ padding: 10 }}
              >
                <Icon name="x" size={20} />
              </Pressable>
            </View>
            {!!(confirmClose) && (
              <Card
                style={{ margin: 16, backgroundColor: C.amberLight, gap: 10 }}
              >
                <T style={{ fontFamily: "DMMedium" }}>Keep your changes?</T>
                <T muted>
                  Your form has unsaved changes. Keep editing or discard this
                  form.
                </T>
                <Button
                  label="Keep editing"
                  onPress={() => setConfirmClose(false)}
                />
                <Button
                  label="Discard changes"
                  variant="ghost"
                  onPress={() => {setDirty(false);setConfirmClose(false);setDetail(pendingDetail);}}
                />
              </Card>
            )}
            <ScrollView
              contentContainerStyle={{ padding: width < 700 ? 20 : 30 }}
              keyboardShouldPersistTaps="handled"
            >
              {!!(detail) && (
                <DetailContent
                  key={detail.kind + ("id" in detail ? detail.id : "")}
                  {...ctx}
                  detail={detail}
                  close={() => setDetail(null)}
                  switchVessel={(id) => {
                    setVesselId(id);
                    setDetail(null);
                  }}
                />
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function Avatar({ text, light = false }: { text: string; light?: boolean }) {
  return (
    <View
      style={{
        height: 34,
        width: 34,
        borderRadius: 18,
        backgroundColor: light ? "#23494c" : "#e9e9df",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <T style={{ fontSize: 10, color: light ? C.gold : C.ink }}>{text}</T>
    </View>
  );
}

function Login({ api, wide }: { api: Portal; wide: boolean }) {
  const [email, setEmail] = useState("owner@demo.lasolas.test");
  const [inviteMode, setInviteMode] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [inviteToken, setInviteToken] = useState("");
  const [password, setPassword] = useState("DemoHarbor!26");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reset, setReset] = useState(false);
  const login = async () => {
    setBusy(true);
    setError("");
    try {
      if (inviteMode) await api.acceptInvitation(inviteToken.trim(), password);
      else await api.login(email.trim(), password);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to enter the portal.");
    } finally {
      setBusy(false);
    }
  };
  const roles = [
    {
      id: "owner",
      name: "Yacht owner",
      detail: "Your vessel, service history, and requests",
      icon: "anchor" as IconName,
    },
    {
      id: "admin",
      name: "Management",
      detail: "Coordinate the fleet and publish the care",
      icon: "layers" as IconName,
    },
    {
      id: "staff",
      name: "Care team",
      detail: "Assigned work, inspections, and field notes",
      icon: "tool" as IconName,
    },
  ];
  return (
    <View style={{ flex: 1, backgroundColor: C.paper, flexDirection: "row" }}>
      <ScrollView
        style={{ flex: wide ? 0.46 : 1 }}
        contentContainerStyle={{
          flexGrow: 1,
          padding: wide ? 60 : 24,
          paddingTop: wide ? 50 : 36,
          paddingBottom: 40,
          justifyContent: wide ? "center" : undefined,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ maxWidth: 430, width: "100%", alignSelf: "center" }}>
          <Wordmark />
          <View
            style={{
              height: 1,
              width: 44,
              backgroundColor: C.gold,
              marginTop: 24,
              marginBottom: 24,
            }}
          />
          <Label style={{ color: C.goldDark }}>
            The Las Olas owner experience
          </Label>
          <T
            serif
            accessibilityRole="header"
            style={{
              fontSize: wide ? 52 : 45,
              lineHeight: wide ? 55 : 46,
              marginTop: 10,
            }}
          >
            Your yacht.{"\n"}In clear view.
          </T>
          <T muted style={{ marginTop: 15, marginBottom: 26 }}>
            Explore a considered way to stay connected to your vessel and the
            people caring for it.
          </T>
          {!inviteMode && (
            <>
              <Label style={{ marginBottom: 6 }}>
                Interactive feedback preview
              </Label>
              <T muted style={{ marginBottom: 16 }}>
                Fictional records. No real services are sent.
              </T>
              <Label style={{ marginBottom: 12 }}>
                Choose your perspective
              </Label>
              <View style={{ gap: 10 }}>
                {roles.map((role) => (
                  <Pressable
                    key={role.id}
                    accessibilityRole="button"
                    accessibilityLabel={`Explore as ${role.name}`}
                    accessibilityState={{
                      selected: email.startsWith(role.id + "@"),
                    }}
                    onPress={() => {
                      setEmail(role.id + "@demo.lasolas.test");
                      setPassword("DemoHarbor!26");
                      setError("");
                    }}
                  >
                    <Card
                      style={{
                        padding: 16,
                        flexDirection: "row",
                        gap: 13,
                        alignItems: "center",
                        borderColor: email.startsWith(role.id + "@")
                          ? C.ink
                          : C.line,
                        backgroundColor: email.startsWith(role.id + "@")
                          ? "#eeefe5"
                          : C.white,
                      }}
                    >
                      <Icon name={role.icon} color={C.goldDark} size={21} />
                      <View style={{ flex: 1 }}>
                        <T style={{ fontFamily: "DMMedium", fontSize: 15 }}>
                          {role.name}
                        </T>
                        <T muted style={{ fontSize: 12, marginTop: 3 }}>
                          {role.detail}
                        </T>
                      </View>
                      <Icon
                        name={
                          email.startsWith(role.id + "@")
                            ? "check-circle"
                            : "circle"
                        }
                        size={18}
                      />
                    </Card>
                  </Pressable>
                ))}
              </View>
            </>
          )}
          {!!((advanced || inviteMode)) && (
            <View style={{ gap: 15, marginTop: 20 }}>
              {inviteMode ? (
                <Field
                  label="Sample invitation token"
                  value={inviteToken}
                  onChangeText={setInviteToken}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              ) : (
                <Field
                  label="Demo email address"
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              )}
              <Field
                label={
                  inviteMode
                    ? "Sample password · 12 or more characters"
                    : "Demo password"
                }
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                onSubmitEditing={() => void login()}
              />
            </View>
          )}
          {!!(error || api.error) && (
            <Card style={{ backgroundColor: C.redLight, marginTop: 18 }}>
              <T accessibilityRole="alert" style={{ color: C.red }}>
                {error || api.error}
              </T>
            </Card>
          )}
          <Button
            label={
              inviteMode ? "Accept sample invitation" : "Enter the preview"
            }
            icon="arrow-right"
            loading={busy}
            style={{ marginTop: 20 }}
            onPress={() => void login()}
          />
          <View style={{ marginTop: 8 }}>
            <Button
              label={
                inviteMode ? "Back to demo accounts" : "Use a sample invitation"
              }
              variant="ghost"
              onPress={() => {
                setInviteMode(!inviteMode);
                setPassword(inviteMode ? "DemoHarbor!26" : "");
                setError("");
                api.clearError();
              }}
            />
            {!inviteMode && (
              <Button
                label={advanced ? "Hide account details" : "Other demo account"}
                variant="ghost"
                onPress={() => setAdvanced(!advanced)}
              />
            )}
          </View>
          <Divider />
          <T muted style={{ fontSize: 12 }}>
            {api.demoMode
              ? "Interactive feedback preview. All vessels and records are fictional. Changes stay in this browser. No service, message, email, or payment is sent to the yacht company. Please use sample information only."
              : "Demonstration accounts on a local development server. No live yacht services or notifications are connected."}
          </T>
          {!!(api.demoMode) && (
            <Button
              label={
                reset ? "Confirm reset demonstration" : "Reset demonstration"
              }
              variant="ghost"
              icon="rotate-ccw"
              style={{ marginTop: 12 }}
              onPress={() =>
                reset
                  ? void api
                      .resetDemo()
                      .then(() => {
                        setReset(false);
                        setError("");
                      })
                      .catch((e) => setError(e.message))
                  : setReset(true)
              }
            />
          )}
        </View>
      </ScrollView>
      {!!(wide) && (
        <ImageBackground
          source={photos.ocean}
          imageStyle={{ width: "100%", height: "100%" }}
          style={{ flex: 0.54, justifyContent: "flex-end" }}
          resizeMode="cover"
        >
          <LinearGradient
            colors={["transparent", "#04262de8"]}
            style={{ padding: 55, paddingTop: 200 }}
          >
            <Label style={{ color: C.gold }}>Las Olas Yacht Management</Label>
            <T
              serif
              style={{
                color: C.paper,
                fontSize: 49,
                lineHeight: 52,
                marginTop: 14,
              }}
            >
              Your yacht.{"\n"}In clear view.
            </T>
            <T style={{ color: "#d2ded8", marginTop: 15 }}>
              FORT LAUDERDALE, FLORIDA
            </T>
          </LinearGradient>
        </ImageBackground>
      )}
    </View>
  );
}

function PageHeading({
  eyebrow,
  title,
  subtitle,
  children,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  children?: React.ReactNode;
}) {
  const { width } = useWindowDimensions();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "flex-end",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: 18,
        marginBottom: 28,
      }}
    >
      <View style={{ flexShrink: 1 }}>
        <Label style={{ color: C.goldDark, marginBottom: 8 }}>{eyebrow}</Label>
        <T
          serif
          accessibilityRole="header"
          style={[
            s.h1,
            width < 700 ? { fontSize: 42, lineHeight: 44 } : undefined,
          ]}
        >
          {title}
        </T>
        <T style={s.subtitle}>{subtitle}</T>
      </View>
      {children}
    </View>
  );
}

function Home(ctx: Context) {
  const { data, vessel, navigate, open, wide } = ctx;
  const reports = data.reports
    .filter((r) => r.vesselId === vessel.id && r.status === "published")
    .sort(
      (a, b) =>
        b.performedAt.localeCompare(a.performedAt) ||
        b.revision - a.revision ||
        b.recordedAt.localeCompare(a.recordedAt),
    );
  const requests = data.requests.filter(
    (r) => r.vesselId === vessel.id && r.status !== "completed",
  );
  const estimates = data.estimates.filter(
    (e) =>
      e.vesselId === vessel.id && e.status === "pending" && !e.supersededBy,
  );
  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: "America/New_York",
  });
  const next = data.visits
    .filter(
      (v) =>
        v.vesselId === vessel.id &&
        v.status === "scheduled" &&
        v.date.slice(0, 10) >= today,
    )
    .sort(
      (a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time),
    )[0];
  const last = reports[0];
  const attention =
    last?.checks.filter(
      (c) => c.status === "action" || c.status === "monitor",
    ) || [];
  return (
    <View>
      <PageHeading
        eyebrow={`Welcome aboard, ${data.user.name.split(" ")[0]}`}
        title="Peace of mind, on board."
        subtitle="Your yacht. Your plans. Every detail in view."
      />
      <View style={{ flexDirection: "row", gap: 12, marginBottom: 18 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Next visit: ${next ? date(next.date) : "To arrange"}`}
          onPress={() => navigate("Schedule")}
          style={{ flex: 1 }}
        >
          <Card style={{ height: "100%", padding: 16, gap: 6 }}>
            <Icon name="calendar" size={18} color={C.goldDark} />
            <Label style={{ letterSpacing: 1 }}>Next visit</Label>
            <T serif style={{ fontSize: 29, lineHeight: 32 }}>
              {next ? date(next.date) : "Let’s plan"}
            </T>
            <T muted numberOfLines={2}>
              {next ? next.title : "Arrange your next service"}
            </T>
          </Card>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Approvals: ${estimates.length} awaiting decision`}
          onPress={() => navigate("Approvals")}
          style={{ flex: 1 }}
        >
          <Card
            style={{
              height: "100%",
              padding: 16,
              gap: 6,
              backgroundColor: estimates.length ? "#eeeee1" : C.white,
            }}
          >
            <Icon name="check-circle" size={18} color={C.goldDark} />
            <Label style={{ letterSpacing: 1 }}>For your review</Label>
            <T serif style={{ fontSize: 29, lineHeight: 32 }}>
              {estimates.length
                ? `${estimates.length} estimate${estimates.length === 1 ? "" : "s"}`
                : "All clear"}
            </T>
            <T muted>
              {estimates.length
                ? "Review scope & approve"
                : "No decisions waiting"}
            </T>
          </Card>
        </Pressable>
      </View>
      <View
        style={{
          flexDirection: "row",
          gap: 10,
          marginTop: 0,
          marginBottom: 18,
        }}
      >
        <Button
          label="Request care"
          icon="plus"
          onPress={() => open({ kind: "new-request" })}
          style={{ flex: 1 }}
        />
        <Button
          label="Plan arrival"
          icon="anchor"
          variant="outline"
          onPress={() => open({ kind: "new-request", intent: "arrival" })}
          style={{ flex: 1 }}
        />
      </View>
      <ImageBackground
        source={photos[vessel.image]}
        imageStyle={{ width: "100%", height: "100%" }}
        style={{
          height: wide ? 300 : 230,
          borderRadius: 12,
          overflow: "hidden",
          justifyContent: "flex-end",
          backgroundColor: C.deep,
        }}
        resizeMode="cover"
      >
        <LinearGradient
          colors={["#04262d00", "#04262d20", "#04262ded"]}
          style={{ position: "absolute", inset: 0 }}
        />
        <View style={{ padding: 22 }}>
          <Label style={{ color: C.gold, fontSize: 10,backgroundColor:"#04262de8",alignSelf:"flex-start",paddingHorizontal:8,paddingVertical:4,borderRadius:3 }}>
            Your vessel · {vessel.program}
          </Label>
          <T
            serif
            style={{
              color: C.white,
              fontSize: 44,
              lineHeight: 49,
              marginTop: 4,
            }}
          >
            {vessel.name}
          </T>
          <T style={{ color: "#e2e7df", fontSize: 12 }}>
            {vessel.model} · {vessel.length}
          </T>
          <View
            style={{
              flexDirection: "row",
              gap: 6,
              alignItems: "center",
              marginTop: 5,
            }}
          >
            <Icon name="map-pin" color={C.gold} size={13} />
            <T style={{ color: "#e2e7df", fontSize: 11, flex: 1 }}>
              {vessel.location}
            </T>
          </View>
        </View>
      </ImageBackground>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`View ${requests.length} open requests`}
        onPress={() => navigate("Requests")}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          minHeight: 52,
          paddingHorizontal: 4,
          marginTop: 8,
        }}
      >
        <Icon name="message-square" color={C.goldDark} size={17} />
        <T style={{ flex: 1 }}>
          {requests.length
            ? `${requests.length} requests in your team’s care`
            : "Your care team is ready to help"}
        </T>
        <Icon name="arrow-right" size={17} />
      </Pressable>
      {!!attention.length && (
        <Card
          style={{ backgroundColor: C.amberLight, marginBottom: 25, gap: 10 }}
        >
          <Label>Latest inspection · {date(last.performedAt)}</Label>
          <T serif style={{ fontSize: 27 }}>
            A detail to keep in view.
          </T>
          {attention.map((c) => (
            <View key={c.label} style={{ gap: 6 }}>
              <T>{c.label}</T>
              <Badge status={c.status} />
            </View>
          ))}
          <Button
            label="Read the inspection"
            variant="ghost"
            icon="arrow-right"
            onPress={() => open({ kind: "report", id: last.id })}
          />
        </Card>
      )}
      <SectionHeading
        title="Recently cared for"
        action="View all"
        onPress={() => navigate("Service history")}
      />
      <Card style={{ padding: 0 }}>
        {reports.slice(0, 3).map((r, i) => (
          <Pressable
            accessibilityRole="button"
            key={r.id}
            onPress={() => open({ kind: "report", id: r.id })}
            style={{
              padding: 18,
              flexDirection: "row",
              alignItems: "center",
              gap: 13,
              borderTopWidth: i ? 1 : 0,
              borderColor: C.line,
            }}
          >
            <View
              style={{
                width: 38,
                height: 42,
                backgroundColor: "#f0f1e9",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 6,
              }}
            >
              <Icon name="clipboard" color={C.goldDark} size={18} />
            </View>
            <View style={{ flex: 1 }}>
              <T style={{ fontFamily: "DMMedium" }}>{r.title}</T>
              <T muted style={{ fontSize: 11, marginTop: 4 }}>
                {date(r.performedAt)} · {r.author}
              </T>
            </View>
            <Icon name="chevron-right" color={C.muted} size={17} />
          </Pressable>
        ))}
        {!reports.length && (
          <View style={{ padding: 22 }}>
            <T muted>Your first published service report will appear here.</T>
          </View>
        )}
      </Card>
      <Card
        style={{
          backgroundColor: C.deep,
          marginTop: 25,
          borderColor: C.deep,
          gap: 10,
        }}
      >
        <Label style={{ color: C.gold }}>The next time you step aboard</Label>
        <T serif style={{ color: C.paper, fontSize: 31, lineHeight: 34 }}>
          An arrival, thoughtfully prepared.
        </T>
        <T style={{ color: "#cad8d1" }}>
          Share your dates and preferences. Your team will coordinate the
          details.
        </T>
        <Button
          label="Share my arrival plans"
          variant="outline"
          onPress={() => open({ kind: "new-request", intent: "arrival" })}
          style={{ backgroundColor: C.paper, marginTop: 6 }}
        />
      </Card>
    </View>
  );
}

function More(ctx: Context) {
  const pending = ctx.data.estimates.filter(
    (e) =>
      e.vesselId === ctx.vessel.id && e.status === "pending" && !e.supersededBy,
  ).length;
  const items: { page: Page; icon: IconName; title: string; detail: string }[] =
    [
      {
        page: "Approvals",
        icon: "check-circle",
        title: "Estimates & approvals",
        detail: pending
          ? `${pending} awaiting your review`
          : "Scopes, decisions, and approval history",
      },
      {
        page: "Schedule",
        icon: "calendar",
        title: "Your yacht’s schedule",
        detail: "Upcoming care, completed visits, and plans",
      },
      {
        page: "Documents",
        icon: "folder",
        title: "Vessel documents",
        detail: "Reference files, renewals, and service exports",
      },
      {
        page: "Account",
        icon: "user",
        title: "Account & preferences",
        detail: "Your access, notifications, and demo controls",
      },
    ];
  return (
    <View>
      <PageHeading
        eyebrow="Everything in its place"
        title="The essentials."
        subtitle={`More ways to stay connected to ${ctx.vessel.name}.`}
      />
      <View style={{ gap: 13 }}>
        {items.map((item) => (
          <Pressable
            key={item.page}
            accessibilityRole="button"
            accessibilityLabel={item.title}
            onPress={() => ctx.navigate(item.page)}
          >
            <Card
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 16,
                padding: 20,
              }}
            >
              <View
                style={{
                  backgroundColor: "#eeeee3",
                  padding: 13,
                  borderRadius: 8,
                }}
              >
                <Icon name={item.icon} color={C.goldDark} size={22} />
              </View>
              <View style={{ flex: 1 }}>
                <T style={{ fontFamily: "DMMedium", fontSize: 15 }}>
                  {item.title}
                </T>
                <T muted style={{ fontSize: 12, marginTop: 5 }}>
                  {item.detail}
                </T>
              </View>
              <Icon name="chevron-right" size={18} />
            </Card>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function History(ctx: Context) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const reports = ctx.data.reports
    .filter(
      (r) =>
        r.vesselId === ctx.vessel.id &&
        (filter === "all" || r.status === filter) &&
        `${r.title} ${r.category} ${r.summary} ${r.author}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    )
    .sort((a, b) => b.performedAt.localeCompare(a.performedAt));
  return (
    <View>
      <PageHeading
        eyebrow={`${ctx.vessel.name} · the record`}
        title="A history of thoughtful care."
        subtitle="Inspections, completed work, and the details behind every visit."
      >
        {ctx.data.user.role !== "owner" ? (
          <Button
            label="Record a service"
            icon="plus"
            onPress={() => ctx.open({ kind: "new-report" })}
          />
        ) : (
          <Button
            label="Export history"
            icon="download"
            variant="outline"
            onPress={() =>
              void ctx.api
                .exportHistory(ctx.vessel.id)
                .catch((e) => ctx.notify(e.message))
            }
          />
        )}
      </PageHeading>
      <Search
        value={search}
        onChange={setSearch}
        placeholder="Search reports, services, or team members"
      />
      {ctx.data.user.role !== "owner" && (
        <View style={{ marginVertical: 17 }}>
          <SelectChips
            value={filter}
            onChange={setFilter}
            options={["all", "draft", "review", "published"].map((value) => ({
              value,
              label:
                value === "all"
                  ? "All reports"
                  : value.charAt(0).toUpperCase() + value.slice(1),
            }))}
          />
        </View>
      )}
      <View style={{ gap: 15, marginTop: 20 }}>
        {reports.map((r) => (
          <Pressable
            key={r.id}
            accessibilityRole="button"
            onPress={() => ctx.open({ kind: "report", id: r.id })}
          >
            <Card
              style={{ flexDirection: "row", gap: 18, alignItems: "center" }}
            >
              <View style={{ alignItems: "center", width: 43 }}>
                <T serif style={{ fontSize: 31, lineHeight: 33 }}>
                  {new Date(r.performedAt).getUTCDate()}
                </T>
                <Label style={{ fontSize: 8 }}>
                  {new Date(r.performedAt).toLocaleDateString("en-US", {
                    month: "short",
                    timeZone: "UTC",
                  })}
                </Label>
              </View>
              <View
                style={{
                  width: 1,
                  alignSelf: "stretch",
                  backgroundColor: C.line,
                }}
              />
              <View style={{ flex: 1, gap: 7 }}>
                <Label style={{ fontSize: 8 }}>{r.category}</Label>
                <T serif style={{ fontSize: 26, lineHeight: 28 }}>
                  {r.title}
                </T>
                <T muted style={{ fontSize: 11 }}>
                  {r.author} · Revision {r.revision}
                </T>
                <Badge status={r.status} />
              </View>
              <Icon name="arrow-up-right" size={18} />
            </Card>
          </Pressable>
        ))}
        {!reports.length && (
          <Empty
            title="No reports found"
            detail="Try another search, or check back after your next published service."
            icon="clipboard"
          />
        )}
      </View>
    </View>
  );
}

function Search({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        backgroundColor: C.white,
        borderWidth: 1,
        borderColor: C.line,
        borderRadius: 5,
        paddingHorizontal: 15,
      }}
    >
      <Icon name="search" size={17} color={C.muted} />
      <TextInput
        accessibilityLabel={placeholder}
        placeholder={placeholder}
        placeholderTextColor={C.muted}
        value={value}
        onChangeText={onChange}
        style={{
          flex: 1,
          height: 49,
          fontFamily: "DM",
          fontSize: 12,
          color: C.ink,
        }}
      />
    </View>
  );
}

function Requests(ctx: Context) {
  const [filter, setFilter] = useState("open");
  const requests = ctx.data.requests
    .filter(
      (r) =>
        r.vesselId === ctx.vessel.id &&
        (filter === "all" ||
          (filter === "completed"
            ? r.status === "completed"
            : r.status !== "completed")),
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return (
    <View>
      <PageHeading
        eyebrow="A direct connection"
        title="Consider it in hand."
        subtitle="Your requests, conversations, and plans for the next visit."
      >
        <Button
          label="New request"
          icon="plus"
          onPress={() => ctx.open({ kind: "new-request" })}
        />
      </PageHeading>
      <SelectChips
        value={filter}
        onChange={setFilter}
        options={[
          { value: "open", label: "Open requests" },
          { value: "completed", label: "Completed" },
          { value: "all", label: "All requests" },
        ]}
      />
      <View style={{ marginTop: 20, gap: 14 }}>
        {requests.map((r) => (
          <Pressable
            key={r.id}
            accessibilityRole="button"
            onPress={() => ctx.open({ kind: "request", id: r.id })}
          >
            <Card>
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  gap: 12,
                }}
              >
                <Label style={{ fontSize: 8 }}>
                  {r.category} · {date(r.createdAt)}
                </Label>
                <Icon name="arrow-up-right" size={16} />
              </View>
              <T serif style={{ fontSize: 29, lineHeight: 31, marginTop: 12 }}>
                {r.title}
              </T>
              <T muted numberOfLines={2} style={{ fontSize: 12, marginTop: 8 }}>
                {r.description}
              </T>
              <Divider />
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: 10,
                }}
              >
                <Badge status={r.status} />
                <T muted style={{ fontSize: 10 }}>
                  {r.coordinator || "Awaiting coordinator"} ·{" "}
                  {r.messages.length} messages
                </T>
              </View>
            </Card>
          </Pressable>
        ))}
        {!requests.length && (
          <Empty
            title="A little room for your plans"
            detail="Request a service, flag an issue, or tell us how you’d like your next arrival prepared."
            icon="message-square"
            action="Create a request"
            onPress={() => ctx.open({ kind: "new-request" })}
          />
        )}
      </View>
    </View>
  );
}

function Approvals(ctx: Context) {
  const estimates = ctx.data.estimates
    .filter((e) => e.vesselId === ctx.vessel.id)
    .sort(
      (a, b) =>
        Number(b.status === "pending" && !b.supersededBy) -
        Number(a.status === "pending" && !a.supersededBy),
    );
  return (
    <View>
      <PageHeading
        eyebrow="Your decisions, clearly recorded"
        title="Before the work begins."
        subtitle="Review the exact scope and estimate. Every decision is tied to a version."
      >
        {ctx.data.user.role === "admin" && (
          <Button
            label="Create estimate"
            icon="plus"
            onPress={() => ctx.open({ kind: "new-estimate" })}
          />
        )}
      </PageHeading>
      <View style={{ gap: 15 }}>
        {estimates.map((e) => (
          <Pressable
            key={e.id}
            accessibilityRole="button"
            onPress={() => ctx.open({ kind: "estimate", id: e.id })}
          >
            <Card>
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <Badge
                  status={e.supersededBy ? "draft" : e.status}
                  label={e.supersededBy ? "Replaced version" : undefined}
                />
                <T muted style={{ fontSize: 10 }}>
                  VERSION {e.version}
                </T>
              </View>
              <T serif style={{ fontSize: 30, lineHeight: 33, marginTop: 17 }}>
                {e.title}
              </T>
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginTop: 15,
                }}
              >
                <T style={{ fontSize: 19, fontFamily: "DMMedium" }}>
                  {money(e.amount, e.currency)}
                </T>
                <Icon name="arrow-right" size={19} />
              </View>
              {!!(e.decidedAt) && (
                <T muted style={{ fontSize: 10, marginTop: 12 }}>
                  Decision by {e.decidedBy} · {date(e.decidedAt, true)}
                </T>
              )}
            </Card>
          </Pressable>
        ))}
        {!estimates.length && (
          <Empty
            title="All clear for now"
            detail="Estimates that need your decision will appear here with the full scope and cost."
            icon="check-circle"
          />
        )}
      </View>
    </View>
  );
}

function Schedule(ctx: Context) {
  const [filter, setFilter] = useState("upcoming");
  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: "America/New_York",
  });
  const visits = ctx.data.visits
    .filter(
      (v) =>
        v.vesselId === ctx.vessel.id &&
        (filter === "all" ||
          (filter === "upcoming"
            ? v.status === "scheduled" && v.date.slice(0, 10) >= today
            : v.status !== "scheduled" || v.date.slice(0, 10) < today)),
    )
    .sort((a, b) =>
      filter === "upcoming"
        ? a.date.localeCompare(b.date)
        : b.date.localeCompare(a.date),
    );
  return (
    <View>
      <PageHeading
        eyebrow="A little planning. A lot of peace of mind."
        title="On the horizon."
        subtitle="Your scheduled care, upcoming visits, and completed work."
      >
        {ctx.data.user.role === "admin" && (
          <Button
            label="Schedule a visit"
            icon="plus"
            onPress={() => ctx.open({ kind: "new-visit" })}
          />
        )}
      </PageHeading>
      <SelectChips
        value={filter}
        onChange={setFilter}
        options={[
          { value: "upcoming", label: "Upcoming" },
          { value: "past", label: "Past & closed" },
          { value: "all", label: "All visits" },
        ]}
      />
      <View style={{ gap: 14, marginTop: 20 }}>
        {visits.map((v) => (
          <Pressable
            key={v.id}
            accessibilityRole="button"
            accessibilityLabel={`Visit: ${v.title}, ${date(v.date)}`}
            onPress={() => ctx.open({ kind: "visit", id: v.id })}
          >
            <Card style={{ flexDirection: "row", gap: 16, padding: 18 }}>
              <View
                style={{
                  width: 55,
                  height: 66,
                  borderWidth: 1,
                  borderColor: C.line,
                  backgroundColor: "#eff1e9",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 6,
                }}
              >
                <Label style={{ letterSpacing: 1 }}>
                  {new Date(
                    v.date.slice(0, 10) + "T12:00:00Z",
                  ).toLocaleDateString("en-US", {
                    month: "short",
                    timeZone: "UTC",
                  })}
                </Label>
                <T serif style={{ fontSize: 32, lineHeight: 34 }}>
                  {new Date(v.date.slice(0, 10) + "T12:00:00Z").getUTCDate()}
                </T>
              </View>
              <View style={{ flex: 1, gap: 6 }}>
                <T serif style={{ fontSize: 27, lineHeight: 29 }}>
                  {v.title}
                </T>
                <T muted>
                  {v.time} ET · {v.assignedTo}
                </T>
                <Badge status={v.status} />
              </View>
              <Icon name="chevron-right" size={17} />
            </Card>
          </Pressable>
        ))}
        {!visits.length && (
          <Empty
            title={
              filter === "upcoming"
                ? "Your next visit is taking shape"
                : "No visits here yet"
            }
            detail={
              filter === "upcoming"
                ? "Share a preferred date and your team will coordinate the next visit."
                : "Try another filter to see your yacht’s schedule."
            }
            icon="calendar"
            action={filter === "upcoming" ? "Request a visit" : undefined}
            onPress={() => ctx.open({ kind: "new-request" })}
          />
        )}
      </View>
      <Card style={{ marginTop: 24, gap: 8, backgroundColor: "#eeefe6" }}>
        <Label>Care, thoughtfully scheduled</Label>
        <T muted>
          Appointments are coordinated by your care team. Recorded engine hours
          and approved equipment schedules guide maintenance; this preview has
          no live telemetry.
        </T>
      </Card>
    </View>
  );
}

function VisitDetail(ctx: Context & { visit: Visit; close: () => void }) {
  const { visit: v, data, api, notify } = ctx;
  const [editing, setEditing] = useState(false);
  const [baselineUpdatedAt,setBaselineUpdatedAt] = useState(v.updatedAt);
  const [when, setWhen] = useState(v.date.slice(0, 10));
  const [time, setTime] = useState(v.time);
  const [assigned, setAssigned] = useState(v.assignedTo);
  const [notes, setNotes] = useState(v.notes || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [cancel, setCancel] = useState(false);
  useEffect(()=>{if(!editing){setBaselineUpdatedAt(v.updatedAt);setWhen(v.date.slice(0,10));setTime(v.time);setAssigned(v.assignedTo);setNotes(v.notes||"");}},[v.updatedAt,editing]);
  const save = async (status = v.status) => {
    setBusy(true);
    setError("");
    try {
      await api.mutate(
        `/api/visits/${v.id}`,
        {
          ...(status === v.status
            ? { date: when, time, assignedTo: assigned, notes }
            : {}),
          status,
          ...((editing?baselineUpdatedAt:v.updatedAt)
            ? { expectedUpdatedAt: editing?baselineUpdatedAt:v.updatedAt }
            : {}),
        },
        "PATCH",
      );
      setEditing(false);
      setCancel(false);
      ctx.markDirty(false);
      notify(
        status === "cancelled"
          ? "Visit cancelled. Its record is preserved."
          : status === "completed"
            ? "Visit marked complete. Publish the service report separately."
            : "Visit schedule updated.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to update this visit.");
    } finally {
      setBusy(false);
    }
  };
  useEffect(
    () =>
      ctx.markDirty(
        editing &&
          (when !== v.date.slice(0, 10) ||
            time !== v.time ||
            assigned !== v.assignedTo ||
            notes !== (v.notes || "")),
      ),
    [editing, when, time, assigned, notes],
  );
  const linked = ctx.data.requests.find((r) => r.id === v.requestId);
  return (
    <View>
      <Badge status={v.status} />
      <T serif style={{ fontSize: 35, lineHeight: 39, marginTop: 14 }}>
        {v.title}
      </T>
      <T muted style={{ marginTop: 8 }}>
        {data.vessels.find((x) => x.id === v.vesselId)?.name} · {v.category}
      </T>
      <Divider />
      <View style={{ gap: 12 }}>
        <Meta label="Visit date" value={date(v.date, true)} />
        <Meta label="Start time" value={v.time + " Eastern Time"} />
        <Meta label="Care team" value={v.assignedTo} />
      </View>
      {!!(v.notes) && <T style={{ marginTop: 20 }}>{v.notes}</T>}
      {!!(linked) && (
        <Button
          label="View related request"
          variant="outline"
          icon="message-square"
          style={{ marginTop: 20 }}
          onPress={() => ctx.open({ kind: "request", id: linked.id })}
        />
      )}
      {data.user.role === "admin" && (
        <View style={{ marginTop: 25, gap: 12 }}>
          {!editing && v.status === "scheduled" ? (
            <Button
              label="Edit visit & reschedule"
              icon="edit-3"
              variant="outline"
              onPress={() => setEditing(true)}
            />
          ) : editing ? (
            <Card style={{ gap: 15 }}>
              <DateField label="Visit date" value={when} onChange={setWhen} />
              <Field
                label="Start time · HH:MM Eastern Time"
                value={time}
                onChangeText={setTime}
              />
              <Field
                label="Assigned team member"
                value={assigned}
                onChangeText={setAssigned}
              />
              <Field
                label="Visit notes"
                value={notes}
                onChangeText={setNotes}
                multiline
              />
              <Button
                label="Save visit changes"
                loading={busy}
                onPress={() => void save()}
              />
              <Button label="Discard visit edits" variant="ghost" onPress={()=>setEditing(false)}/>
            </Card>
          ) : <Button label="Schedule a follow-up visit" icon="calendar" variant="outline" onPress={()=>ctx.open({kind:"new-visit",requestId:v.requestId})}/>}
          {v.status === "scheduled" && !editing && (
            <>
              <Button
                label="Mark visit completed"
                icon="check-circle"
                loading={busy}
                onPress={() => void save("completed")}
              />
              <Button
                label={cancel ? "Confirm cancel visit" : "Cancel this visit"}
                variant="ghost"
                loading={busy}
                onPress={() =>
                  cancel ? void save("cancelled") : setCancel(true)
                }
              />
              {!!(cancel) && (
                <T style={{ color: C.amber }}>
                  The cancelled visit stays in the schedule history. This does
                  not change the related request.
                </T>
              )}
            </>
          )}
        </View>
      )}
      {!!(error) && (
        <T accessibilityRole="alert" style={{ color: C.red, marginTop: 15 }}>
          {error}
        </T>
      )}
      {data.user.role === "owner" && (
        <Button
          label="Ask my team about this visit"
          icon="message-square"
          style={{ marginTop: 25 }}
          onPress={() =>
            linked
              ? ctx.open({ kind: "request", id: linked.id })
              : ctx.open({ kind: "new-request" })
          }
        />
      )}
    </View>
  );
}

function Documents(ctx: Context) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const docs = ctx.data.documents.filter((d) => d.vesselId === ctx.vessel.id);
  const filtered = docs.filter(
    (d) =>
      (category === "All" || d.category === category) &&
      d.title.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <View>
      <PageHeading
        eyebrow="Safely in order"
        title="The details, documented."
        subtitle="Reports, vessel documents, and reference material in one library."
      >
        <Button
          label="Export service history"
          icon="download"
          variant="outline"
          onPress={() =>
            void ctx.api
              .exportHistory(ctx.vessel.id)
              .catch((e) => ctx.notify(e.message))
          }
        />
      </PageHeading>
      <Search
        value={search}
        onChange={setSearch}
        placeholder="Find a document"
      />
      <View style={{ marginTop: 15, marginBottom: 22 }}>
        <SelectChips
          value={category}
          onChange={setCategory}
          options={["All", ...new Set(docs.map((d) => d.category))].map(
            (c) => ({ value: c, label: c }),
          )}
        />
      </View>
      <View style={{ gap: 12 }}>
        {filtered.map((d) => (
          <Card
            key={d.id}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 15,
              padding: 19,
            }}
          >
            <View
              style={{
                backgroundColor: "#f0efe6",
                padding: 12,
                borderRadius: 4,
              }}
            >
              <Icon name="file-text" size={21} color={C.goldDark} />
            </View>
            <View style={{ flex: 1 }}>
              <T style={{ fontSize: 12, fontFamily: "DMMedium" }}>{d.title}</T>
              <T muted style={{ fontSize: 10, marginTop: 3 }}>
                {d.category} · {date(d.date)} · {d.size}
              </T>
              {!!(d.expiresAt) && (
                <T style={{ color: C.amber, fontSize: 10 }}>
                  Expires {date(d.expiresAt, true)}
                </T>
              )}
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Download ${d.title}`}
              onPress={() =>
                void ctx.api
                  .downloadDocument(d.id)
                  .then(() => ctx.notify("Demonstration document downloaded."))
                  .catch((e) => ctx.notify(e.message))
              }
              style={{ padding: 12 }}
            >
              <Icon name="download" size={18} />
            </Pressable>
          </Card>
        ))}
        {!filtered.length && (
          <Empty
            title="No matching documents"
            detail="Try another search or document category."
            icon="folder"
          />
        )}
      </View>
      <T muted style={{ fontSize: 10, marginTop: 17 }}>
        Demonstration downloads contain sample text. Actual vessel files are
        added through the configured production document service.
      </T>
    </View>
  );
}

function Account(ctx: Context) {
  const { api, data, notify } = ctx;
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const prefs = data.user.preferences || {
    reports: true,
    messages: true,
    reminders: true,
  };
  return (
    <View>
      <PageHeading
        eyebrow="Personal to you"
        title="Your account & preferences."
        subtitle="Manage your portal experience and see who has access."
      />
      <Card>
        <View style={s.row}>
          <Avatar text={data.user.initials} />
          <View>
            <T serif style={{ fontSize: 29 }}>
              {data.user.name}
            </T>
            <T muted style={{ fontSize: 12 }}>
              {data.user.email}
            </T>
          </View>
        </View>
        <Divider />
        <Label>Assigned vessel access</Label>
        {data.vessels.map((v) => (
          <View
            key={v.id}
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              paddingTop: 13,
            }}
          >
            <T style={{ fontSize: 12 }}>{v.name}</T>
            <T muted style={{ fontSize: 11, textTransform: "capitalize" }}>
              {data.user.role}
            </T>
          </View>
        ))}
      </Card>
      <View style={{ marginTop: 25 }}>
        <SectionHeading title="Keep me in the loop" />
        <Card>
          {(["reports", "messages", "reminders"] as const).map((key, i) => (
            <View
              key={key}
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                paddingVertical: i ? 16 : 0,
                borderTopWidth: i ? 1 : 0,
                borderColor: C.line,
                marginTop: i ? 16 : 0,
              }}
            >
              <View style={{ flex: 1, paddingRight: 16 }}>
                <T style={{ fontSize: 12, fontFamily: "DMMedium" }}>
                  {
                    {
                      reports: "Published service reports",
                      messages: "Messages & decisions",
                      reminders: "Upcoming visits & renewals",
                    }[key]
                  }
                </T>
                <T muted style={{ fontSize: 10, marginTop: 4 }}>
                  In-app preference · Push delivery is not connected
                </T>
              </View>
              <Switch
                accessibilityLabel={`Receive ${key}`}
                value={prefs[key]}
                trackColor={{ false: "#d5dcd2", true: "#6b8c79" }}
                thumbColor={C.white}
                onValueChange={(value) =>
                  void api
                    .mutate(
                      "/api/preferences",
                      { ...prefs, [key]: value },
                      "PATCH",
                    )
                    .then(() => notify("Notification preference saved."))
                    .catch((e) => notify(e.message))
                }
              />
            </View>
          ))}
        </Card>
      </View>
      <View style={{ marginTop: 25 }}>
        <SectionHeading title="Field work & synchronization" />
        <Card>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <View style={{ flex: 1, paddingRight: 15 }}>
              <T style={{ fontSize: 12, fontFamily: "DMMedium" }}>
                Offline field mode
              </T>
              <T muted style={{ fontSize: 11, marginTop: 5 }}>
                Capture draft reports, requests, and messages. Pending entries
                sync when you return online. Decisions and publication require a
                connection.
              </T>
            </View>
            <Switch
              accessibilityLabel="Offline field mode"
              value={api.offlineMode}
              onValueChange={api.setOfflineMode}
              trackColor={{ false: "#d5dcd2", true: "#6b8c79" }}
              thumbColor={C.white}
            />
          </View>
          {api.pending.length > 0 && (
            <View style={{ marginTop: 15, gap: 9 }}>
              <Label>{api.pending.length} pending field entries</Label>
              {api.pending.map((p) => (
                <T key={p.id} muted style={{ fontSize: 10 }}>
                  {String(
                    p.body.title ||
                      (p.path.includes("/messages")
                        ? "Conversation message"
                        : "Draft service report"),
                  )}{" "}
                  · Captured {date(p.createdAt)}
                  {String(
                    p.body.summary || p.body.description || p.body.text || "",
                  )
                    ? "\n" +
                      String(
                        p.body.summary || p.body.description || p.body.text,
                      )
                    : ""}
                </T>
              ))}
            </View>
          )}
          <Button
            label={api.syncing ? "Synchronizing…" : "Sync now"}
            icon="refresh-cw"
            loading={api.syncing}
            variant="outline"
            style={{ marginTop: 18 }}
            onPress={() =>
              api.offlineMode ? api.setOfflineMode(false) : void api.refresh()
            }
          />
        </Card>
      </View>
      <Card style={{ marginTop: 25 }}>
        <Label>Privacy & support · Demonstration</Label>
        <T muted style={{ fontSize: 11, marginTop: 10 }}>
          {api.demoMode
            ? "This interactive preview stores fictional accounts, messages, preferences, reports, and selected sample photos in this browser only. Nothing is sent to a yacht company. Use sample information only. Reset the demonstration to remove your local changes."
            : "This development portal stores demonstration accounts, messages, preferences, reports, and uploaded files on its local server."}{" "}
          A device cache supports field drafts. Signing out clears the local
          session and cached records. No push, analytics, payment, accounting,
          or live telemetry providers are connected.
        </T>
        <T muted style={{ fontSize: 11, marginTop: 10 }}>
          Urgent issues: a portal request does not provide emergency response.
          Use your agreed direct contact or the appropriate emergency service.
          Business support contacts and escalation rules must be configured
          before launch.
        </T>
        <T muted style={{ fontSize: 11, marginTop: 10 }}>
          Live invitations, vessel assignments, retention and account revocation
          are administrator responsibilities in production. Management can
          create manual demonstration invitations and update vessel assignments
          from the workspace.
        </T>
      </Card>
      {api.pending.length > 0 && confirmSignOut && (
        <Card style={{ marginTop: 20, backgroundColor: C.amberLight }}>
          <T style={{ color: C.amber, fontSize: 12 }}>
            There are {api.pending.length} unsynchronized entries on this
            device. Sync them before signing out, or select “Discard pending
            entries & sign out” to remove them from this device.
          </T>
        </Card>
      )}
      {!!(api.demoMode) && (
        <Card style={{ marginTop: 22, gap: 12 }}>
          <Label>Feedback preview · this browser only</Label>
          <T muted>
            Switch roles by signing out. Your demo changes stay available across
            roles in this browser. No real service, email, or payment is sent.
          </T>
          {!!(confirmReset) && (
            <T>
              Reset restores the sample vessels and removes the demo changes you
              made here.
            </T>
          )}
          <Button
            label={
              confirmReset
                ? "Confirm reset demonstration"
                : "Reset demonstration"
            }
            variant="outline"
            icon="rotate-ccw"
            onPress={() =>
              confirmReset ? void api.resetDemo() : setConfirmReset(true)
            }
          />
          {!!(confirmReset) && (
            <Button
              label="Keep my demo changes"
              variant="ghost"
              onPress={() => setConfirmReset(false)}
            />
          )}
        </Card>
      )}
      <Button
        label={
          api.pending.length > 0 && confirmSignOut
            ? "Discard pending entries & sign out"
            : "Sign out of the portal"
        }
        icon="log-out"
        variant="outline"
        style={{ marginTop: 22, alignSelf: "flex-start" }}
        onPress={() =>
          api.pending.length > 0 && !confirmSignOut
            ? setConfirmSignOut(true)
            : void api.logout()
        }
      />
    </View>
  );
}

function Workspace(ctx: Context) {
  const { data, vessel, open, navigate, wide } = ctx;
  const drafts = data.reports.filter((r) => r.status !== "published");
  return (
    <View>
      <PageHeading
        eyebrow={
          data.user.role === "admin"
            ? "Management workspace"
            : "Field workspace"
        }
        title="Every detail, accounted for."
        subtitle="Coordinate the fleet, record the work, and review before publishing."
      >
        <Button
          label="Record field work"
          icon="plus"
          onPress={() => open({ kind: "new-report" })}
        />
      </PageHeading>
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          gap: 12,
          marginBottom: 26,
        }}
      >
        {[
          {
            label: "Assigned vessels",
            count: data.vessels.length,
            icon: "anchor",
          },
          {
            label: "Open requests",
            count: data.requests.filter((r) => r.status !== "completed").length,
            icon: "message-square",
          },
          {
            label: "Reports in progress",
            count: drafts.length,
            icon: "clipboard",
          },
        ].map((x) => (
          <Card key={x.label} style={{ flex: 1, minWidth: 140 }}>
            <Icon name={x.icon as IconName} color={C.goldDark} />
            <T serif style={{ fontSize: 40, marginTop: 10 }}>
              {String(x.count).padStart(2, "0")}
            </T>
            <Label style={{ fontSize: 8 }}>{x.label}</Label>
          </Card>
        ))}
      </View>
      <SectionHeading title="The fleet at a glance" />
      <View style={{ gap: 12 }}>
        {data.vessels.map((v) => (
          <Pressable
            accessibilityRole="button"
            key={v.id}
            onPress={() => open({ kind: "vessels" })}
          >
            <Card
              style={{ flexDirection: "row", alignItems: "center", gap: 17 }}
            >
              <Image
                source={photos[v.image]}
                style={{ width: wide ? 105 : 65, height: 68, borderRadius: 5 }}
              />
              <View style={{ flex: 1 }}>
                <T serif style={{ fontSize: 27 }}>
                  {v.name}
                </T>
                <T muted style={{ fontSize: 10 }}>
                  {v.model} · {v.location}
                </T>
                <T muted style={{ fontSize: 10 }}>
                  {
                    data.requests.filter(
                      (r) => r.vesselId === v.id && r.status !== "completed",
                    ).length
                  }{" "}
                  open requests ·{" "}
                  {
                    data.reports.filter(
                      (r) => r.vesselId === v.id && r.status !== "published",
                    ).length
                  }{" "}
                  unpublished reports
                </T>
              </View>
              {v.id === vessel.id && wide && (
                <Badge label="Selected" status="published" />
              )}
              <Icon name="chevron-right" size={16} />
            </Card>
          </Pressable>
        ))}
      </View>
      <View style={{ marginTop: 28 }}>
        <SectionHeading
          title="Ready for the next step"
          action="All service records"
          onPress={() => navigate("Service history")}
        />
        <View style={{ gap: 12 }}>
          {drafts.map((r) => (
            <Pressable
              key={r.id}
              accessibilityRole="button"
              onPress={() => open({ kind: "report", id: r.id })}
            >
              <Card
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 15,
                }}
              >
                <View style={{ flex: 1 }}>
                  <Label style={{ fontSize: 8 }}>
                    {data.vessels.find((v) => v.id === r.vesselId)?.name}
                  </Label>
                  <T serif style={{ fontSize: 26, marginTop: 4 }}>
                    {r.title}
                  </T>
                  <T muted style={{ fontSize: 10 }}>
                    {r.author} · {date(r.performedAt)}
                  </T>
                </View>
                <Badge status={r.status} />
                <Icon name="arrow-right" size={16} />
              </Card>
            </Pressable>
          ))}
          {!drafts.length && (
            <Empty
              title="Review queue is clear"
              detail="Drafts submitted by your team will appear here before owner publication."
              icon="clipboard"
            />
          )}
        </View>
      </View>
      <View
        style={{
          marginTop: 25,
          flexDirection: "row",
          flexWrap: "wrap",
          gap: 10,
        }}
      >
        {data.user.role === "admin" && (
          <Button
            label="People & vessel access"
            icon="users"
            variant="outline"
            onPress={() => open({ kind: "access" })}
          />
        )}
        <Button
          label="Manage requests"
          icon="message-square"
          variant="outline"
          onPress={() => navigate("Requests")}
        />
        <Button
          label="Estimates & decisions"
          icon="check-circle"
          variant="outline"
          onPress={() => navigate("Approvals")}
        />
        <Button
          label="View schedule"
          icon="calendar"
          variant="outline"
          onPress={() => navigate("Schedule")}
        />
      </View>
    </View>
  );
}

function DetailContent(
  ctx: Context & {
    detail: Detail;
    close: () => void;
    switchVessel: (id: string) => void;
  },
) {
  const { detail, data, api, close, notify } = ctx;
  if (detail.kind === "access")
    return data.user.role === "admin" ? (
      <Access api={api} data={data} notify={notify} />
    ) : (
      <Empty
        title="Management access required"
        detail="An administrator manages invitations and vessel assignments."
      />
    );
  if (detail.kind === "vessels")
    return (
      <View>
        <T serif style={{ fontSize: 36, marginBottom: 10 }}>
          Your vessels.
        </T>
        <T muted style={{ fontSize: 12, marginBottom: 22 }}>
          Select a vessel to bring its care into focus.
        </T>
        <View style={{ gap: 12 }}>
          {data.vessels.map((v) => (
            <Pressable
              key={v.id}
              accessibilityRole="button"
              onPress={() => ctx.switchVessel(v.id)}
            >
              <Card
                style={{
                  flexDirection: "row",
                  gap: 15,
                  alignItems: "center",
                  borderColor: v.id === ctx.vessel.id ? C.ink : C.line,
                }}
              >
                <Image
                  source={photos[v.image]}
                  style={{ width: 75, height: 60, borderRadius: 4 }}
                />
                <View style={{ flex: 1 }}>
                  <T serif style={{ fontSize: 28 }}>
                    {v.name}
                  </T>
                  <T muted style={{ fontSize: 10 }}>
                    {v.model}
                  </T>
                </View>
                <Icon
                  name={v.id === ctx.vessel.id ? "check-circle" : "arrow-right"}
                  size={20}
                />
              </Card>
            </Pressable>
          ))}
        </View>
      </View>
    );
  if (detail.kind === "notifications")
    return (
      <View>
        <T serif style={{ fontSize: 36, marginBottom: 20 }}>
          Your latest updates.
        </T>
        <View style={{ gap: 13 }}>
          {data.notifications.map((n) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${n.title}${n.read ? "" : ", mark as read"}`}
              key={n.id}
              onPress={() =>
                void api
                  .mutate(`/api/notifications/${n.id}/read`, {})
                  .catch((e) => notify(e.message))
              }
            >
              <Card
                style={{
                  backgroundColor: n.read ? C.white : "#ecf0e6",
                  padding: 18,
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <Icon
                    name={n.type === "message" ? "message-square" : "bell"}
                    color={C.goldDark}
                    size={18}
                  />
                  <T style={{ fontFamily: "DMMedium", fontSize: 12, flex: 1 }}>
                    {n.title}
                  </T>
                  {!n.read && (
                    <View
                      style={{
                        width: 5,
                        height: 5,
                        borderRadius: 3,
                        backgroundColor: C.goldDark,
                      }}
                    />
                  )}
                </View>
                <T muted style={{ marginTop: 8, fontSize: 11 }}>
                  {n.body}
                </T>
                <T muted style={{ marginTop: 7, fontSize: 9 }}>
                  {date(n.createdAt, true)} ·{" "}
                  {data.vessels.find((v) => v.id === n.vesselId)?.name}
                </T>
              </Card>
            </Pressable>
          ))}
          {!data.notifications.length && (
            <Empty
              title="You’re all caught up"
              detail="Service reports and conversations will appear here as they are recorded."
              icon="bell"
            />
          )}
        </View>
      </View>
    );
  if (detail.kind === "report") {
    const report = data.reports.find((r) => r.id === detail.id);
    return report ? (
      <ReportDetail {...ctx} report={report} />
    ) : (
      <Empty
        title="Report unavailable"
        detail="Refresh your records or ask your coordinator about this report."
      />
    );
  }
  if (detail.kind === "request") {
    const request = data.requests.find((r) => r.id === detail.id);
    return request ? (
      <RequestDetail {...ctx} request={request} />
    ) : (
      <Empty
        title="Request unavailable"
        detail="This request is no longer available to your account."
      />
    );
  }
  if (detail.kind === "visit") {
    const visit = data.visits.find((v) => v.id === detail.id);
    return visit ? (
      <VisitDetail {...ctx} visit={visit} />
    ) : (
      <Empty
        title="Visit unavailable"
        detail="Refresh your schedule for the latest visits."
      />
    );
  }
  if (detail.kind === "estimate") {
    const estimate = data.estimates.find((e) => e.id === detail.id);
    return estimate ? (
      <EstimateDetail {...ctx} estimate={estimate} />
    ) : (
      <Empty
        title="Estimate unavailable"
        detail="Refresh your records to see the latest estimate."
      />
    );
  }
  return (
    <CreateForm
      {...ctx}
      kind={
        detail.kind as
          "new-request" | "new-report" | "new-estimate" | "new-visit"
      }
      requestId={"requestId" in detail ? detail.requestId : undefined}
      supersedesId={"supersedesId" in detail ? detail.supersedesId : undefined}
      intent={"intent" in detail ? detail.intent : undefined}
    />
  );
}

function ReportDetail(ctx: Context & { report: Report; close: () => void }) {
  const { report: r, api, notify, data, close } = ctx;
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [returning, setReturning] = useState(false);
  const [reason, setReason] = useState("");
  const [actionError, setActionError] = useState("");
  const returnForChanges = async () => {
    setBusy(true);
    setActionError("");
    try {
      await api.mutate(`/api/reports/${r.id}/return`, { reason });
      setReturning(false);
      notify("Report returned to draft with private review feedback.");
    } catch (e) {
      setActionError(
        e instanceof Error ? e.message : "Unable to return report.",
      );
    } finally {
      setBusy(false);
    }
  };
  useEffect(
    () => ctx.markDirty(returning && !!reason.trim()),
    [returning, reason],
  );
  if (editing)
    return (
      <CreateForm
        {...ctx}
        kind="new-report"
        existingReport={r}
        close={() => setEditing(false)}
      />
    );
  const act = async (suffix: string) => {
    setBusy(true);
    setActionError("");
    try {
      await api.mutate(`/api/reports/${r.id}/${suffix}`, {});
      notify(
        suffix === "publish"
          ? "Report published to the owner."
          : "Report submitted for management review.",
      );
    } catch (e) {
      setActionError(
        e instanceof Error ? e.message : "Unable to update report.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <View>
      {!!(actionError) && (
        <T accessibilityRole="alert" style={{ color: C.red, marginBottom: 15 }}>
          {actionError}
        </T>
      )}
      <Badge status={r.status} />
      <T serif style={{ fontSize: 36, lineHeight: 39, marginTop: 13 }}>
        {r.title}
      </T>
      <T muted style={{ marginTop: 9, fontSize: 11 }}>
        {r.category} · Revision {r.revision}
      </T>
      <Divider />
      <View style={{ gap: 8 }}>
        <Meta label="Performed" value={date(r.performedAt, true)} />
        <Meta label="Recorded" value={date(r.recordedAt, true)} />
        <Meta label="Recorded by" value={r.author} />
        <Meta
          label="Vessel"
          value={data.vessels.find((v) => v.id === r.vesselId)?.name || ""}
        />
      </View>
      <Divider />
      <T style={{ fontSize: 13 }}>{r.summary}</T>
      <T serif style={{ fontSize: 27, marginTop: 24, marginBottom: 12 }}>
        Inspection observations
      </T>
      <Card style={{ padding: 16 }}>
        {r.checks.map((check, i) => (
          <View
            key={check.label + i}
            style={{
              borderTopWidth: i ? 1 : 0,
              borderColor: C.line,
              paddingVertical: 12,
              gap: 7,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 10,
              }}
            >
              <T style={{ fontSize: 12, flex: 1 }}>{check.label}</T>
              <Badge status={check.status} />
            </View>
            {!!((check.value || check.equipment)) && (
              <T muted style={{ fontSize: 10 }}>
                {[check.value, check.equipment].filter(Boolean).join(" · ")}
              </T>
            )}
          </View>
        ))}
      </Card>
      <T muted style={{ fontSize: 10, marginTop: 9 }}>
        Status reflects staff observations on the performed date. Not checked
        means no condition assessment was recorded.
      </T>
      <T serif style={{ fontSize: 27, marginTop: 24, marginBottom: 12 }}>
        Work performed
      </T>
      {r.workPerformed.map((w, i) => (
        <View
          key={i}
          style={{ flexDirection: "row", gap: 10, marginBottom: 9 }}
        >
          <Icon name="check" size={15} color={C.green} />
          <T style={{ flex: 1, fontSize: 12 }}>{w}</T>
        </View>
      ))}
      {r.attachments.length > 0 && (
        <AttachmentList attachments={r.attachments} api={api} notify={notify} />
      )}
      {r.internalNotes !== undefined && data.user.role !== "owner" && (
        <Card style={{ backgroundColor: C.amberLight, marginTop: 20 }}>
          <Label>Internal working notes · staff only</Label>
          <T style={{ fontSize: 12, marginTop: 8 }}>
            {r.internalNotes || "No internal notes."}
          </T>
        </Card>
      )}
      {data.user.role !== "owner" && r.status === "draft" && (
        <Button
          label="Edit draft report"
          icon="edit-3"
          variant="outline"
          style={{ marginTop: 23 }}
          onPress={() => setEditing(true)}
        />
      )}
      {data.user.role !== "owner" && r.status === "draft" && (
        <Button
          label="Submit for review"
          icon="arrow-right"
          loading={busy}
          style={{ marginTop: 23 }}
          onPress={() => void act("submit")}
        />
      )}
      {data.user.role === "admin" && r.status === "review" && (
        <Button
          label="Publish to owner"
          icon="check-circle"
          loading={busy}
          style={{ marginTop: 23 }}
          onPress={() => void act("publish")}
        />
      )}
      {data.user.role === "admin" && r.status === "review" && (
        <View style={{ marginTop: 12, gap: 12 }}>
          <Button
            label="Return for changes"
            variant="outline"
            icon="corner-up-left"
            onPress={() => setReturning(!returning)}
          />
          {!!(returning) && (
            <>
              <Field
                label="Private review feedback"
                value={reason}
                onChangeText={setReason}
                multiline
                placeholder="Tell the care team what needs clarification."
              />
              <Button
                label="Return report to draft"
                loading={busy}
                disabled={!reason.trim()}
                onPress={() => void returnForChanges()}
              />
            </>
          )}
          {!!(actionError) && (
            <T accessibilityRole="alert" style={{ color: C.red }}>
              {actionError}
            </T>
          )}
        </View>
      )}
      {r.status === "published" && data.user.role !== "owner" && (
        <Button
          label="Create a correction revision"
          icon="edit-3"
          variant="outline"
          style={{ marginTop: 23 }}
          onPress={async () => {
            try {
              await api.mutate(`/api/reports/${r.id}/revisions`, {});
              notify(
                "Correction draft created; the published report is preserved.",
              );
              close();
            } catch (e) {
              setActionError(e instanceof Error ? e.message : "Unable to create revision.");
            }
          }}
        />
      )}
    </View>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <View
      style={{ flexDirection: "row", justifyContent: "space-between", gap: 16 }}
    >
      <T muted style={{ fontSize: 11 }}>
        {label}
      </T>
      <T style={{ fontSize: 11, flexShrink: 1, textAlign: "right" }}>{value}</T>
    </View>
  );
}
function AttachmentList({
  attachments,
  api,
  notify,
}: {
  attachments: Attachment[];
  api: Portal;
  notify: (message: string) => void;
}) {
  return (
    <View style={{ marginTop: 22 }}>
      <Label style={{ marginBottom: 10 }}>Attachments</Label>
      {attachments.map((a) => (
        <Pressable
          key={a.id}
          accessibilityRole="button"
          accessibilityLabel={`Download ${a.name}`}
          onPress={() =>
            void api.downloadAttachment(a).catch((e) => notify(e.message))
          }
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            paddingVertical: 12,
            borderBottomWidth: 1,
            borderColor: C.line,
          }}
        >
          <Icon name="image" size={17} color={C.goldDark} />
          <T style={{ flex: 1, fontSize: 11 }}>{a.name}</T>
          <Icon name="download" size={16} />
        </Pressable>
      ))}
    </View>
  );
}

function RequestDetail(ctx: Context & { request: ServiceRequest }) {
  const { request: r, api, notify, data } = ctx;
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [messageError, setMessageError] = useState("");
  const [messageFeedback,setMessageFeedback]=useState("");
  useEffect(() => ctx.markDirty(!!message.trim()), [message]);
  const send = async () => {
    if (!message.trim()) return;
    setBusy(true);
    setMessageError("");
    try {
      const result = await api.mutate(`/api/requests/${r.id}/messages`, {
        text: message.trim(),
      });
      setMessage("");
      setMessageFeedback(result.queued?"Saved on this device. Your message will appear in the conversation after synchronization.":"Message added to this conversation.");
      notify(
        result.queued
          ? "Message captured. Pending synchronization."
          : "Message added to the conversation.",
      );
    } catch (e) {
      setMessageError(
        e instanceof Error ? e.message : "Unable to send message.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <View>
      <Badge status={r.status} />
      <View style={{ flexDirection: "row", gap: 4, marginTop: 16 }}>
        {[
          "submitted",
          "acknowledged",
          "scheduled",
          "in_progress",
          "completed",
        ].map((step, i) => (
          <View
            key={step}
            style={{
              height: 4,
              flex: 1,
              borderRadius: 2,
              backgroundColor:
                i <=
                [
                  "submitted",
                  "acknowledged",
                  "scheduled",
                  "in_progress",
                  "completed",
                ].indexOf(r.status)
                  ? C.ink
                  : C.line,
            }}
          />
        ))}
      </View>
      <T muted style={{ marginTop: 8 }}>
        {
          {
            submitted: "Received · Your team will review this request.",
            acknowledged:
              "Acknowledged · Your coordinator is reviewing the details.",
            scheduled: "Scheduled · View the planned visit below.",
            in_progress: "In progress · Your care team is working on it.",
            completed:
              "Completed · Keep the conversation and related records here.",
          }[r.status]
        }
      </T>
      <T serif style={{ fontSize: 36, lineHeight: 39, marginTop: 13 }}>
        {r.title}
      </T>
      <T muted style={{ fontSize: 11, marginTop: 9 }}>
        {r.category} · Requested {date(r.createdAt, true)}
      </T>
      <Divider />
      <T style={{ fontSize: 13 }}>{r.description}</T>
      <View style={{ marginTop: 17, gap: 8 }}>
        <Meta
          label="Coordinator"
          value={r.coordinator || "Awaiting assignment"}
        />
        <Meta label="Priority" value={r.priority} />
        {!!(r.desiredDate) && (
          <Meta label="Requested date" value={date(r.desiredDate, true)} />
        )}
      </View>
      {r.priority === "urgent" && (
        <T style={{ color: C.red, fontSize: 11, marginTop: 15 }}>
          For urgent matters, use your agreed direct contact. Portal requests
          are not emergency dispatch.
        </T>
      )}
      {data.user.role !== "owner" && (
        <View style={{ marginTop: 22 }}>
          <Label style={{ marginBottom: 10 }}>Update work status</Label>
          <SelectChips
            value={r.status}
            onChange={(status) =>
              void api
                .mutate(
                  `/api/requests/${r.id}`,
                  {
                    status,
                    coordinator:
                      !r.coordinator || r.coordinator === "Unassigned"
                        ? data.user.name
                        : r.coordinator,
                  },
                  "PATCH",
                )
                .then(() => notify("Request status updated."))
                .catch((e) => setMessageError(e.message))
            }
            options={[
              "acknowledged",
              "scheduled",
              "in_progress",
              "completed",
            ].map((value) => ({ value, label: value.replace("_", " ") }))}
          />
        </View>
      )}
      {data.user.role !== "owner" && (
        <View
          style={{
            marginTop: 20,
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 8,
          }}
        >
          {data.user.role === "admin" && (
            <>
              <Button
                compact
                label="Prepare estimate"
                icon="file-text"
                variant="outline"
                onPress={() =>
                  ctx.open({ kind: "new-estimate", requestId: r.id })
                }
              />
              <Button
                compact
                label="Schedule work"
                icon="calendar"
                variant="outline"
                onPress={() => ctx.open({ kind: "new-visit", requestId: r.id })}
              />
            </>
          )}
          <Button
            compact
            label="Record completed work"
            icon="clipboard"
            variant="outline"
            onPress={() => ctx.open({ kind: "new-report", requestId: r.id })}
          />
        </View>
      )}
      {data.estimates
        .filter((e) => e.requestId === r.id)
        .map((e) => (
          <Pressable
            key={e.id}
            accessibilityRole="button"
            onPress={() => ctx.open({ kind: "estimate", id: e.id })}
            style={{ marginTop: 13 }}
          >
            <Card style={{ padding: 15, gap: 7 }}>
              <Label>Related estimate · version {e.version}</Label>
              <T style={{ fontSize: 12 }}>
                {e.title} · {money(e.amount, e.currency)}
              </T>
              <Badge
                status={e.supersededBy ? "draft" : e.status}
                label={e.supersededBy ? "Replaced version" : undefined}
              />
            </Card>
          </Pressable>
        ))}
      {data.reports
        .filter((report) => report.requestId === r.id)
        .map((report) => (
          <Pressable
            key={report.id}
            accessibilityRole="button"
            onPress={() => ctx.open({ kind: "report", id: report.id })}
            style={{ marginTop: 13 }}
          >
            <Card style={{ padding: 15, gap: 7 }}>
              <Label>Related service report</Label>
              <T style={{ fontSize: 12 }}>{report.title}</T>
              <Badge status={report.status} />
            </Card>
          </Pressable>
        ))}
      {data.visits
        .filter((v) => v.requestId === r.id)
        .map((v) => (
          <Card key={v.id} style={{ marginTop: 13, padding: 15 }}>
            <Label>Scheduled work · {date(v.date)}</Label>
            <T style={{ fontSize: 12 }}>
              {v.title} · {v.time} ET
            </T>
          </Card>
        ))}
      {r.attachments.length > 0 && (
        <AttachmentList attachments={r.attachments} api={api} notify={notify} />
      )}
      <T serif style={{ fontSize: 28, marginTop: 27, marginBottom: 15 }}>
        The conversation
      </T>
      <View style={{ gap: 12 }}>
        {r.messages.map((m) => (
          <Card
            key={m.id}
            style={{
              backgroundColor:
                m.author === data.user.name ? "#eaf0e8" : C.white,
              padding: 17,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <T style={{ fontSize: 11, fontFamily: "DMMedium" }}>{m.author}</T>
              <T muted style={{ fontSize: 9 }}>
                {date(m.createdAt)}
              </T>
            </View>
            <T style={{ fontSize: 12, marginTop: 7 }}>{m.text}</T>
          </Card>
        ))}
        {!r.messages.length && (
          <T muted style={{ fontSize: 12 }}>
            No messages yet. Start the conversation below.
          </T>
        )}
      </View>
      {api.pending.filter(p=>p.path===`/api/requests/${r.id}/messages`).map(p=><Card key={p.id} style={{marginTop:12,backgroundColor:C.amberLight,gap:6}}><Badge label="Pending sync"/><T>{String(p.body.text||"")}</T></Card>)}
      {!!(messageFeedback)&&<T accessibilityRole="alert" style={{marginTop:15,color:C.green}}>{messageFeedback}</T>}
      <View style={{ marginTop: 18, gap: 11 }}>
        {!!(messageError) && (
          <T accessibilityRole="alert" style={{ color: C.red }}>
            {messageError}
          </T>
        )}
        <Field
          label="Your message"
          value={message}
          onChangeText={setMessage}
          multiline
          placeholder="Share a detail or ask a question…"
        />
        <Button
          label="Send message"
          icon="send"
          disabled={!message.trim()}
          loading={busy}
          onPress={() => void send()}
        />
      </View>
    </View>
  );
}

function EstimateDetail(ctx: Context & { estimate: Estimate }) {
  const { estimate: e, data, api, notify } = ctx;
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [decisionError, setDecisionError] = useState("");
  useEffect(() => {
    setConfirmed(false);
    setDecisionError("");
  }, [e.id, e.version]);
  const decision = async (value: "approved" | "declined") => {
    setBusy(true);
    setDecisionError("");
    try {
      await api.mutate(`/api/estimates/${e.id}/decision`, {
        version: e.version,
        decision: value,
      });
      notify(
        value === "approved"
          ? "Your approval and this estimate version have been recorded."
          : "Estimate declined. Your decision has been recorded.",
      );
    } catch (err) {
      setDecisionError(
        err instanceof Error ? err.message : "Unable to record decision.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <View>
      <Badge
        status={e.supersededBy ? "draft" : e.status}
        label={e.supersededBy ? "Replaced version" : undefined}
      />
      <T serif style={{ fontSize: 36, lineHeight: 39, marginTop: 13 }}>
        {e.title}
      </T>
      <T muted style={{ fontSize: 11, marginTop: 9 }}>
        Estimate {e.id} · Version {e.version} ·{" "}
        {data.vessels.find((v) => v.id === e.vesselId)?.name}
      </T>
      <Divider />
      <Label>Total estimated cost · {e.currency}</Label>
      <T serif style={{ fontSize: 48, lineHeight: 55, marginVertical: 8 }}>
        {money(e.amount, e.currency)}
      </T>
      <T muted style={{ fontSize: 11 }}>
        Approval authorizes this exact scope and version. No payment is
        collected.
      </T>
      <Divider />
      <T serif style={{ fontSize: 28, marginBottom: 17 }}>
        The proposed scope
      </T>
      {e.scope.map((item, i) => (
        <View
          key={i}
          style={{ flexDirection: "row", gap: 12, marginBottom: 13 }}
        >
          <T style={{ color: C.goldDark, fontSize: 11 }}>
            {String(i + 1).padStart(2, "0")}
          </T>
          <T style={{ flex: 1, fontSize: 12 }}>{item}</T>
        </View>
      ))}
      {!!(e.supersededBy) && (
        <Card style={{ marginTop: 15, backgroundColor: C.amberLight }}>
          <T style={{ fontSize: 12 }}>
            A newer estimate replaces this version. This original scope and any
            recorded decision are preserved.
          </T>
        </Card>
      )}
      {data.user.role === "admin" && !e.supersededBy && (
        <Button
          label="Revise scope & issue a new version"
          icon="edit-3"
          variant="outline"
          style={{ marginTop: 20 }}
          onPress={() =>
            ctx.open({
              kind: "new-estimate",
              supersedesId: e.id,
              requestId: e.requestId,
            })
          }
        />
      )}
      {!!(decisionError) && (
        <Card style={{ backgroundColor: C.redLight, marginTop: 16 }}>
          <T accessibilityRole="alert" style={{ color: C.red }}>
            {decisionError}
          </T>
          <Button
            label="Refresh latest estimate"
            variant="ghost"
            onPress={() => void api.refresh()}
          />
        </Card>
      )}
      {e.status === "pending" &&
      !e.supersededBy &&
      data.user.role === "owner" ? (
        <View style={{ marginTop: 15 }}>
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: confirmed }}
            aria-checked={confirmed}
            accessibilityLabel={`I have reviewed version ${e.version} and its scope`}
            onPress={() => setConfirmed(!confirmed)}
            style={{
              flexDirection: "row",
              gap: 12,
              paddingVertical: 15,
              alignItems: "center",
            }}
          >
            <View
              style={{
                height: 22,
                width: 22,
                borderRadius: 3,
                borderWidth: 1,
                borderColor: confirmed ? C.ink : C.muted,
                backgroundColor: confirmed ? C.ink : "transparent",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {!!(confirmed) && <Icon name="check" color={C.white} size={15} />}
            </View>
            <T style={{ flex: 1, fontSize: 11 }}>
              I have reviewed version {e.version}, its full scope, and the{" "}
              {money(e.amount, e.currency)} estimate.
            </T>
          </Pressable>
          <Button
            label="Approve this estimate"
            icon="check-circle"
            disabled={!confirmed || !api.online || api.offlineMode}
            loading={busy}
            onPress={() => void decision("approved")}
          />
          <Button
            label="Decline estimate"
            disabled={!api.online || api.offlineMode}
            variant="ghost"
            loading={busy}
            onPress={() => void decision("declined")}
            style={{ marginTop: 8 }}
          />
          <T muted style={{ fontSize: 10, marginTop: 12 }}>
            A scope change requires a new estimate and decision. Decisions
            require an online connection.
          </T>
        </View>
      ) : (
        <Card style={{ marginTop: 20, backgroundColor: "#edf0e7" }}>
          <T style={{ fontSize: 12 }}>
            {e.status === "pending" && e.supersededBy
              ? "Replaced before a decision was recorded."
              : e.status === "pending" && !e.supersededBy
                ? "Awaiting a decision from an assigned owner."
                : `${e.status === "approved" ? "Approved" : "Declined"} by ${e.decidedBy} on ${date(e.decidedAt || "", true)}.`}
          </T>
        </Card>
      )}
    </View>
  );
}

function CreateForm(
  ctx: Context & {
    kind: "new-request" | "new-report" | "new-estimate" | "new-visit";
    close: () => void;
    existingReport?: Report;
    requestId?: string;
    supersedesId?: string;
    intent?: "arrival";
  },
) {
  const {
    kind,
    vessel: selectedVessel,
    data,
    api,
    notify,
    close,
    existingReport,
    requestId,
    supersedesId,
  } = ctx;
  const vessel =
    data.vessels.find((v) => v.id === existingReport?.vesselId) ||
    selectedVessel;
  const priorEstimate = data.estimates.find((e) => e.id === supersedesId);
  const linkedRequest = data.requests.find(
    (r) => r.id === (requestId || priorEstimate?.requestId),
  );
  const initialTitle =
    existingReport?.title ||
    priorEstimate?.title ||
    linkedRequest?.title ||
    (ctx.intent === "arrival" ? "Prepare for our arrival" : "");
  const initialCategory =
    existingReport?.category ||
    linkedRequest?.category ||
    (ctx.intent === "arrival" ? "Yacht concierge" : categories[0]);
  const [baselineRecordedAt] = useState(existingReport?.recordedAt);
  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState(
    existingReport?.summary || priorEstimate?.scope.join("\n") || "",
  );
  const [workText, setWorkText] = useState(
    existingReport?.workPerformed.join("\n") || "",
  );
  const [category, setCategory] = useState(initialCategory);
  const [priority, setPriority] = useState("routine");
  const [when, setWhen] = useState(
    existingReport?.performedAt.slice(0, 10) || "",
  );
  const [amount, setAmount] = useState(
    priorEstimate ? String(priorEstimate.amount) : "",
  );
  const [internal, setInternal] = useState(existingReport?.internalNotes || "");
  const [equipment, setEquipment] = useState("");
  const [reading, setReading] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>(
    existingReport?.attachments || [],
  );
  const [checks, setChecks] = useState<Check[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  useEffect(() => {
    ctx.markDirty(
      title !== initialTitle ||
        category !== initialCategory ||
        priority !== "routine" ||
        description !==
          (existingReport?.summary || priorEstimate?.scope.join("\n") || "") ||
        workText !== (existingReport?.workPerformed.join("\n") || "") ||
        when !== (existingReport?.performedAt.slice(0, 10) || "") ||
        amount !== (priorEstimate ? String(priorEstimate.amount) : "") ||
        internal !== (existingReport?.internalNotes || "") ||
        !!equipment ||
        !!reading ||
        attachments.length !== (existingReport?.attachments.length || 0) ||
        checks.some(
          (c, i) =>
            c.status !== (existingReport?.checks[i]?.status || "not_checked"),
        ),
    );
  }, [
    title,
    description,
    category,
    priority,
    workText,
    when,
    amount,
    internal,
    equipment,
    reading,
    attachments,
    checks,
  ]);
  const template =
    data.checklistTemplates.find((t) => t.category === category) ||
    data.checklistTemplates.find((t) =>
      t.category.toLowerCase().includes(category.split(" ")[0].toLowerCase()),
    );
  useEffect(() => {
    if (kind === "new-report") {
      if (existingReport && category === existingReport.category) {
        setChecks(existingReport.checks);
        return;
      }
      setChecks(
        (
          template?.checks || [
            "Visual inspection",
            "System operation",
            "Safety equipment",
            "General condition",
          ]
        ).map((label) => ({ label, status: "not_checked" })),
      );
    }
  }, [category, kind]);
  const addPhoto = async () => {
    setError("");
    setUploading(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        base64: true,
        quality: 0.65,
      });
      if (!result.canceled) {
        const a = result.assets[0];
        if (!a.base64)
          throw new Error("Unable to read this photo. Choose a JPEG or PNG.");
        const attachment = await api.uploadAttachment(
          vessel.id,
          a.fileName || "field-photo.jpg",
          a.mimeType || "image/jpeg",
          a.base64,
        );
        setAttachments([...attachments, attachment]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Photo upload failed.");
    } finally {
      setUploading(false);
    }
  };
  const submit = async () => {
    setError("");
    if (!title.trim())
      return setError("Add a title so your team can identify this work.");
    if (!description.trim())
      return setError(
        kind === "new-estimate"
          ? "Add the full proposed scope."
          : "Add the details of the work or request.",
      );
    if (when && !/^\d{4}-\d{2}-\d{2}$/.test(when))
      return setError("Use a date in YYYY-MM-DD format.");
    if (
      kind === "new-estimate" &&
      (!Number.isFinite(Number(amount)) || Number(amount) <= 0)
    )
      return setError("Enter a positive estimate amount.");
    if (
      kind === "new-visit" &&
      amount &&
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(amount)
    )
      return setError("Use a start time in 24-hour HH:MM format.");
    if (kind === "new-visit" && !when)
      return setError("Choose a date for the scheduled visit.");
    setBusy(true);
    try {
      let path = "/api/requests";
      let body: Record<string, unknown> = {
        vesselId: vessel.id,
        title: title.trim(),
        description: description.trim(),
        category,
        priority,
        attachments,
        ...(when ? { desiredDate: when } : {}),
      };
      if (kind === "new-report") {
        path = "/api/reports";
        body = {
          vesselId: vessel.id,
          title: title.trim(),
          category,
          summary: description.trim(),
          checks: checks.map((check, i) =>
            i === 0
              ? {
                  ...check,
                  ...(equipment ? { equipment } : {}),
                  ...(reading ? { value: reading } : {}),
                }
              : check,
          ),
          workPerformed: workText.split("\n").filter((l) => l.trim()),
          internalNotes: internal,
          performedAt: when || new Date().toISOString(),
          attachments,
          status: "draft",
        };
        if (existingReport) {
          path += "/" + existingReport.id;
          body.expectedRecordedAt = baselineRecordedAt;
        }
      }
      if (kind === "new-estimate") {
        path = "/api/estimates";
        body = {
          vesselId: vessel.id,
          title: title.trim(),
          scope: description.split("\n").filter((l) => l.trim()),
          amount: Number(amount),
          currency: "USD",
        };
      }
      if (kind === "new-visit") {
        path = "/api/visits";
        body = {
          vesselId: vessel.id,
          title: title.trim(),
          category,
          date: when,
          time: amount || "09:00",
          assignedTo: internal || data.user.name,
          status: "scheduled",
          notes: description,
        };
      }
      if ((requestId || priorEstimate?.requestId) && kind !== "new-request")
        body.requestId = requestId || priorEstimate?.requestId;
      if (supersedesId && kind === "new-estimate")
        body.supersedesId = supersedesId;
      const result = await api.mutate(
        path,
        body,
        existingReport ? "PATCH" : "POST",
      );
      notify(
        result.queued
          ? "Field entry saved on this device. Pending synchronization."
          : kind === "new-report"
            ? "Draft saved. Submit it for review when ready."
            : kind === "new-estimate"
              ? "Estimate created for the owner’s review."
              : kind === "new-visit"
                ? "Visit added to the schedule."
                : "Request sent to your care team.",
      );
      ctx.markDirty(false);
      close();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Unable to save. Your form is still here.",
      );
    } finally {
      setBusy(false);
    }
  };
  const heading = {
    "new-request": "Tell us what you have in mind.",
    "new-report": "Record the care.",
    "new-estimate": "A clear scope. A clear decision.",
    "new-visit": "Make time for thoughtful care.",
  }[kind];
  return (
    <View>
      <Label>{vessel.name}</Label>
      <T
        serif
        style={{
          fontSize: 34,
          lineHeight: 37,
          marginTop: 10,
          marginBottom: 24,
        }}
      >
        {heading}
      </T>
      <View style={{ gap: 18 }}>
        <Field
          label={kind === "new-request" ? "Request title" : "Title"}
          value={title}
          onChangeText={setTitle}
          placeholder={
            kind === "new-request"
              ? "e.g. Prepare for our weekend arrival"
              : "e.g. Weekly systems inspection"
          }
        />
        <View style={{ gap: 8 }}>
          <T style={{ fontSize: 12, fontFamily: "DMMedium" }}>
            Service category
          </T>
          <SelectChips
            value={category}
            onChange={setCategory}
            options={categories.map((c) => ({ value: c, label: c }))}
          />
        </View>
        <Field
          label={
            kind === "new-estimate"
              ? "Exact proposed scope (one item per line)"
              : kind === "new-report"
                ? "Owner-visible summary"
                : "Details & preferences"
          }
          value={description}
          onChangeText={setDescription}
          multiline
          placeholder={
            ctx.intent === "arrival"
              ? "Arrival and departure dates, guest count, provisions, and any special preferences…"
              : "The details help us care for your yacht."
          }
        />
        {kind === "new-request" && (
          <View style={{ gap: 8 }}>
            <T style={{ fontSize: 12, fontFamily: "DMMedium" }}>Priority</T>
            <SelectChips
              value={priority}
              onChange={setPriority}
              options={[
                { value: "routine", label: "Routine" },
                { value: "soon", label: "Soon" },
                { value: "urgent", label: "Urgent" },
              ]}
            />
            {priority === "urgent" && (
              <T style={{ fontSize: 11, color: C.red }}>
                Use your agreed direct contact for urgent matters. The portal is
                not emergency dispatch.
              </T>
            )}
          </View>
        )}
        {kind !== "new-estimate" && (
          <DateField
            label={
              kind === "new-report"
                ? "Performed date · optional (YYYY-MM-DD)"
                : kind === "new-visit"
                  ? "Visit date (YYYY-MM-DD)"
                  : "Preferred date · optional (YYYY-MM-DD)"
            }
            value={when}
            onChangeText={setWhen}
            placeholder="YYYY-MM-DD"
            autoCapitalize="none"
          />
        )}
        {kind === "new-estimate" && (
          <Field
            label="Total estimate · USD"
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
            placeholder="0.00"
          />
        )}
        {kind === "new-visit" && (
          <>
            <Field
              label="Start time · Eastern Time (HH:MM)"
              value={amount}
              onChangeText={setAmount}
              placeholder="09:00"
            />
            <Field
              label="Assigned team member"
              value={internal}
              onChangeText={setInternal}
              placeholder={data.user.name}
            />
          </>
        )}
        {kind === "new-report" && (
          <>
            <Field
              label="Work performed (one item per line)"
              value={workText}
              onChangeText={setWorkText}
              multiline
              placeholder="Record the work completed during this visit."
            />
            <Field
              label="Equipment reference · optional"
              value={equipment}
              onChangeText={setEquipment}
              placeholder="Port engine / serial number"
            />
            <Field
              label="Recorded reading · optional"
              value={reading}
              onChangeText={setReading}
              placeholder="e.g. 428.5 engine hours"
            />
            <T serif style={{ fontSize: 27 }}>
              Inspection checklist
            </T>
            <T muted style={{ fontSize: 10 }}>
              Demonstration template. Confirm business checklists before live
              use. Every item starts as not checked.
            </T>
            {checks.map((c, i) => (
              <View
                key={i}
                style={{
                  gap: 9,
                  borderBottomWidth: 1,
                  borderColor: C.line,
                  paddingBottom: 15,
                }}
              >
                <T style={{ fontSize: 12, fontFamily: "DMMedium" }}>
                  {c.label}
                </T>
                <SelectChips
                  value={c.status}
                  onChange={(status) =>
                    setChecks(
                      checks.map((check, index) =>
                        index === i
                          ? { ...check, status: status as CheckStatus }
                          : check,
                      ),
                    )
                  }
                  options={[
                    { value: "passed", label: "Passed" },
                    { value: "monitor", label: "Monitor" },
                    { value: "action", label: "Needs action" },
                    { value: "not_checked", label: "Not checked" },
                    { value: "not_applicable", label: "N/A" },
                  ]}
                />
              </View>
            ))}
            <Field
              label="Internal notes · staff only"
              value={internal}
              onChangeText={setInternal}
              multiline
              placeholder="These notes stay separate from the owner’s report."
            />
          </>
        )}
        {!!((kind === "new-request" || kind === "new-report")) && (
          <View>
            <Button
              label={attachments.length ? "Add another photo" : "Add a photo"}
              icon="camera"
              variant="outline"
              loading={uploading}
              disabled={!api.online || api.offlineMode}
              onPress={() => void addPhoto()}
            />
            {attachments.map((a) => (
              <T key={a.id} muted style={{ fontSize: 11, marginTop: 8 }}>
                {a.name} · Uploaded
              </T>
            ))}
            {!!((api.offlineMode || !api.online)) && (
              <T muted style={{ fontSize: 10, marginTop: 8 }}>
                Photo upload requires a connection. Text field entries can be
                captured offline.
              </T>
            )}
          </View>
        )}
        {!!(error) && (
          <T accessibilityRole="alert" style={{ color: C.red, fontSize: 12 }}>
            {error}
          </T>
        )}
        <Button
          label={
            kind === "new-report"
              ? "Save draft report"
              : kind === "new-estimate"
                ? "Send estimate for review"
                : kind === "new-visit"
                  ? "Schedule this visit"
                  : api.offlineMode
                    ? "Capture request offline"
                    : "Send request"
          }
          icon="arrow-right"
          loading={busy}
          disabled={uploading}
          onPress={() => void submit()}
        />
      </View>
    </View>
  );
}
