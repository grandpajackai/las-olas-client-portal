import React from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
  TextStyle,
  useWindowDimensions,
} from "react-native";
import Feather from "@expo/vector-icons/Feather";

export const C = {
  ink: "#062f35",
  deep: "#04262d",
  paper: "#f7f5ef",
  white: "#fffefa",
  muted: "#526662",
  line: "#e1e5dd",
  gold: "#cbb58a",
  goldDark: "#806333",
  green: "#326f56",
  greenLight: "#e9f0e8",
  amber: "#88632f",
  amberLight: "#f5eddc",
  red: "#a34e40",
  redLight: "#f8eae4",
};
export type IconName = React.ComponentProps<typeof Feather>["name"];
export function Icon({
  name,
  size = 20,
  color = C.ink,
}: {
  name: IconName;
  size?: number;
  color?: string;
}) {
  return <Feather name={name} size={size} color={color} />;
}
export function T({
  children,
  style,
  muted = false,
  serif = false,
  micro = false,
  ...props
}: React.ComponentProps<typeof Text> & {
  muted?: boolean;
  serif?: boolean;
  micro?: boolean;
}) {
  const { width } = useWindowDimensions();
  const flat = StyleSheet.flatten(style) || {};
  const mobileSize =
    width < 700 && !serif && !String(flat.fontFamily).startsWith("Cormorant")
      ? Math.max(flat.fontSize || 14, micro ? 11 : 13)
      : undefined;
  return (
    <Text
      {...props}
      style={[
        {
          fontFamily: serif ? "Cormorant" : "DM",
          fontSize: 14,
          color: muted ? C.muted : C.ink,
          lineHeight: serif ? undefined : 22,
        },
        style,
        mobileSize
          ? {
              fontSize: mobileSize,
              lineHeight: Math.max(
                flat.lineHeight || 0,
                Math.ceil(mobileSize * 1.5),
              ),
            }
          : undefined,
      ]}
    >
      {children}
    </Text>
  );
}
export function Label({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: TextStyle;
}) {
  return (
    <T
      micro
      style={[
        {
          fontFamily: "DMMedium",
          fontSize: 10,
          letterSpacing: 1.9,
          lineHeight: 16,
          textTransform: "uppercase",
          color: C.muted,
        },
        style,
      ]}
    >
      {children}
    </T>
  );
}
export function Button({
  label,
  onPress,
  icon,
  variant = "primary",
  disabled,
  loading,
  compact = false,
  style,
}: {
  label: string;
  onPress: () => void;
  icon?: IconName;
  variant?: "primary" | "outline" | "ghost" | "danger";
  disabled?: boolean;
  loading?: boolean;
  compact?: boolean;
  style?: ViewStyle;
}) {
  const dark = variant === "primary" || variant === "danger";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed, hovered }: any) => [
        s.button,
        {
          minHeight: 48,
          paddingHorizontal: compact ? 14 : 19,
          backgroundColor:
            variant === "primary"
              ? C.ink
              : variant === "danger"
                ? C.red
                : "transparent",
          borderWidth: variant === "outline" ? 1 : 0,
          borderColor: C.line,
          opacity: disabled ? 0.4 : pressed ? 0.7 : 1,
        },
        hovered && !dark && { backgroundColor: "#ecede5" },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={dark ? C.white : C.ink} />
      ) : icon ? (
        <Icon name={icon} size={16} color={dark ? C.white : C.ink} />
      ) : null}
      <T
        style={{
          color: dark ? C.white : C.ink,
          fontFamily: "DMMedium",
          fontSize: 14,
          flexShrink: 1,
          textAlign: "center",
        }}
      >
        {label}
      </T>
    </Pressable>
  );
}
export function Badge({ status, label }: { status?: string; label?: string }) {
  const green = [
    "passed",
    "published",
    "approved",
    "completed",
    "scheduled",
  ].includes(status || "");
  const red = ["action", "urgent", "declined"].includes(status || "");
  const grey = ["not_checked", "not_applicable", "draft"].includes(
    status || "",
  );
  const text =
    label ||
    (
      {
        not_checked: "Not checked",
        not_applicable: "Not applicable",
        action: "Needs action",
        monitor: "Monitor",
        review: "In review",
        in_progress: "In progress",
        pending: "Awaiting approval",
        submitted: "Submitted",
        acknowledged: "Acknowledged",
      } as Record<string, string>
    )[status || ""] ||
    status ||
    "Recorded";
  const color = green ? C.green : red ? C.red : grey ? C.muted : C.amber;
  return (
    <View
      style={{
        alignSelf: "flex-start",
        backgroundColor: green
          ? C.greenLight
          : red
            ? C.redLight
            : grey
              ? "#eef0eb"
              : C.amberLight,
        borderRadius: 4,
        paddingHorizontal: 9,
        paddingVertical: 4,
        flexDirection: "row",
        gap: 5,
        alignItems: "center",
      }}
    >
      <View
        style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: color }}
      />
      <T
        style={{
          color,
          fontSize: 10,
          lineHeight: 15,
          textTransform: "capitalize",
          fontFamily: "DMMedium",
        }}
      >
        {text}
      </T>
    </View>
  );
}
export function Card({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
}) {
  return <View style={[s.card, style]}>{children}</View>;
}
export function Divider() {
  return (
    <View style={{ height: 1, backgroundColor: C.line, marginVertical: 18 }} />
  );
}
export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return (
    <View style={{ gap: 7 }}>
      <T style={{ fontSize: 12, fontFamily: "DMMedium" }}>{label}</T>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor="#5c6d67"
        {...props}
        style={[
          s.input,
          props.multiline && {
            minHeight: 100,
            textAlignVertical: "top",
            paddingTop: 14,
          },
          props.style,
        ]}
      />
    </View>
  );
}
export function DateField({
  label,
  value,
  onChange,
  onChangeText,
}: {
  label: string;
  value: string;
  onChange?: (value: string) => void;
  onChangeText?: (value: string) => void;
  placeholder?: string;
  autoCapitalize?: string;
}) {
  const update = onChange || onChangeText || (() => {});
  if (Platform.OS !== "web")
    return (
      <Field
        label={label}
        value={value}
        onChangeText={update}
        placeholder="YYYY-MM-DD"
        autoCapitalize="none"
        keyboardType="numbers-and-punctuation"
      />
    );
  return (
    <View style={{ gap: 7 }}>
      <T style={{ fontFamily: "DMMedium", fontSize: 12 }}>{label}</T>
      {React.createElement("input", {
        type: "date",
        value,
        "aria-label": label,
        onInput: (event: React.FormEvent<HTMLInputElement>) => update(event.currentTarget.value),
        onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
          update(event.target.value),
        style: {
          width: "100%",
          boxSizing: "border-box",
          minWidth: 0,
          height: 48,
          border: "1px solid " + C.line,
          borderRadius: 5,
          padding: "0 14px",
          background: C.white,
          color: C.ink,
          fontFamily: "DM, sans-serif",
          fontSize: 16,
        },
      })}
    </View>
  );
}

export function SelectChips({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7 }}>
      {options.map((o) => (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: o.value === value }}
          key={o.value}
          onPress={() => onChange(o.value)}
          style={{
            minHeight: 44,
            justifyContent: "center",
            paddingHorizontal: 12,
            paddingVertical: 9,
            borderWidth: 1,
            borderRadius: 5,
            borderColor: value === o.value ? C.ink : C.line,
            backgroundColor: value === o.value ? C.ink : C.white,
          }}
        >
          <T
            style={{
              fontSize: 11,
              color: value === o.value ? C.white : C.muted,
            }}
          >
            {o.label}
          </T>
        </Pressable>
      ))}
    </View>
  );
}
export function SectionHeading({
  title,
  action,
  onPress,
}: {
  title: string;
  action?: string;
  onPress?: () => void;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 15,
        gap: 12,
      }}
    >
      <T serif style={{ fontSize: 29 }}>
        {title}
      </T>
      {action && onPress ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={action}
          onPress={onPress}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            minHeight: 44,
          }}
        >
          <T style={{ fontSize: 11, fontFamily: "DMMedium" }}>{action}</T>
          <Icon name="arrow-up-right" size={14} />
        </Pressable>
      ) : null}
    </View>
  );
}
export function Empty({
  title,
  detail,
  icon = "inbox",
  action,
  onPress,
}: {
  title: string;
  detail: string;
  icon?: IconName;
  action?: string;
  onPress?: () => void;
}) {
  return (
    <Card style={{ alignItems: "center", paddingVertical: 42, gap: 10 }}>
      <Icon name={icon} size={28} color={C.goldDark} />
      <T serif style={{ fontSize: 27 }}>
        {title}
      </T>
      <T muted style={{ textAlign: "center", maxWidth: 350, fontSize: 12 }}>
        {detail}
      </T>
      {action && onPress ? (
        <Button label={action} onPress={onPress} variant="outline" />
      ) : null}
    </Card>
  );
}
export function Wordmark({ light = false }: { light?: boolean }) {
  return (
    <View style={{ gap: 0 }}>
      <T
        serif
        style={{
          fontSize: 37,
          lineHeight: 39,
          color: light ? C.paper : C.ink,
          letterSpacing: 1,
        }}
      >
        LAS OLAS
      </T>
      <T
        style={{
          fontSize: 7,
          letterSpacing: 3.2,
          color: light ? C.gold : C.goldDark,
          lineHeight: 15,
        }}
      >
        YACHT MANAGEMENT
      </T>
    </View>
  );
}
export const s = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  card: {
    backgroundColor: C.white,
    borderColor: C.line,
    borderWidth: 1,
    borderRadius: 8,
    padding: 22,
  },
  button: {
    borderRadius: 5,
    flexDirection: "row",
    gap: 9,
    justifyContent: "center",
    alignItems: "center",
  },
  input: {
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 5,
    height: 48,
    paddingHorizontal: 14,
    fontFamily: "DM",
    fontSize: 16,
    color: C.ink,
  },
  h1: {
    fontFamily: "Cormorant",
    fontSize: 46,
    lineHeight: 49,
    letterSpacing: -0.7,
    color: C.ink,
  },
  subtitle: { color: C.muted, fontSize: 12, marginTop: 8 },
  small: { fontSize: 11, lineHeight: 18 },
});
export const date = (iso: string, full = false) =>
  iso
    ? new Date(iso.length === 10 ? iso + "T12:00:00Z" : iso).toLocaleDateString(
        "en-US",
        {
          month: full ? "long" : "short",
          day: "numeric",
          ...(full ? { year: "numeric" } : {}),
          timeZone: "America/New_York",
        },
      )
    : "Not recorded";
export const money = (amount: number, currency = "USD") =>
  new Intl.NumberFormat("en-US", { style: "currency", currency }).format(
    amount,
  );
