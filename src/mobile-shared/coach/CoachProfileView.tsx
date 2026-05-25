/**
 * CoachProfileView.tsx
 *
 * Pure props component — no route.params, no navigation dependency.
 * Renders the complete coach profile UI as a composable view that can be:
 *   1. Used inside CoachDetailScreen (wrapped with navigation/route)
 *   2. Rendered via React Native Web inside the PT portal live preview panel
 *
 * Props-only design is deliberate: this component must never import
 * @react-navigation/native or read from route state directly.
 *
 * Part of Issue #13 — extracted from CoachDetailScreen.
 * Zero visual change to the mobile app.
 */

import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Linking,
  Dimensions,
  Modal,
  TouchableOpacity,
  FlatList,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { spacing, radius, typography } from '../theme/tokens';

// ── Types ──────────────────────────────────────────────────────────────────

export interface CoachGalleryPhoto {
  id: string;
  public_url: string;
}

export interface CoachPackage {
  id: string;
  title: string;
  price: number;
  duration?: string | null;
  promo_label?: string | null;
  promo_active?: boolean;
  promo_starts_at?: string | null;
  promo_ends_at?: string | null;
  featured?: boolean;
}

export interface CoachProfileData {
  id: string;
  name: string;
  photo_url: string | null;
  bio: string | null;
  is_personal_trainer: boolean | null;
  is_nutritionist: boolean | null;
  specialties: string[] | null;
  qualifications: string | null;
  achievements: string | null;
  /** Whether the members deal card should show at all */
  members_deal_active?: boolean | null;
  members_deal: string | null;
  coupon_code: string | null;
  email: string | null;
  phone: string | null;
  regions: string[] | null;
  online_remote: boolean | null;
  website: string | null;
  facebook: string | null;
  instagram: string | null;
  tiktok: string | null;
  youtube: string | null;
  /** Optional gallery photos for the horizontal scroll row */
  gallery_photos?: CoachGalleryPhoto[] | null;
  /** Optional pricing packages list */
  packages?: CoachPackage[] | null;
  /**
   * DB-managed role labels from coach_role_assignments + coach_roles.
   * When present, this takes priority over the legacy is_personal_trainer /
   * is_nutritionist booleans for the title displayed under the coach's name.
   *
   * Rendering rules:
   *   1 role  → label uppercased ("PERSONAL TRAINER")
   *   2 roles → joined with " & " ("PERSONAL TRAINER & NUTRITIONIST")
   *   3+ roles → first two joined with ", " + "& N MORE"
   *              ("PERSONAL TRAINER, NUTRITIONIST & 2 MORE")
   *
   * Falls back to boolean-derived label when roles is null/empty (backwards compat).
   */
  roles?: string[] | null;
}

export interface CoachThemeColors {
  primary: string;
  background: string;
  surface: string;
  surfaceAlt: string;
  text: string;
  textMuted: string;
  textSubtle: string;
  border: string;
  headerBg: string;
  headerFg: string;
}

export interface CoachStats {
  value: string;
  label: string;
}

export interface CoachProfileViewProps {
  coach: CoachProfileData;
  colors: CoachThemeColors;
  /** Optional — passed for bookable coaches to show the Book CTA */
  isBookable?: boolean;
  /** Optional stats row (sessions, rating, members saved) */
  stats?: CoachStats[] | null;
  /** Optional starting price shown in hero pill */
  startingPrice?: number | null;
  /** Callback for the Book CTA — only relevant in full-screen native context */
  onBookPress?: () => void;
  /** Scroll container width — defaults to device screen width */
  containerWidth?: number;
}

// ── Icon map ───────────────────────────────────────────────────────────────

const SPECIALTY_ICON_MAP: Record<string, string> = {
  'meal planning':      'restaurant-outline',
  'recovery':           'fitness-outline',
  'supplements':        'medical-outline',
  'nutrition':          'restaurant-outline',
  'sports nutrition':   'restaurant-outline',
  'strength':           'barbell-outline',
  'mindset':            'brain',
  'performance':        'flash-outline',
  'weight loss':        'trending-down-outline',
  'body recomposition': 'body-outline',
};

function specialtyIcon(label: string): string {
  const key = label.toLowerCase();
  for (const [k, v] of Object.entries(SPECIALTY_ICON_MAP)) {
    if (key.includes(k)) return v;
  }
  return 'star-outline';
}

// ── Promo date check helper ─────────────────────────────────────────────────

function isPromoInRange(starts?: string | null, ends?: string | null): boolean {
  const now = Date.now();
  if (starts && new Date(starts).getTime() > now) return false;
  if (ends && new Date(ends).getTime() < now) return false;
  return true;
}

// ── PackagesList sub-component ─────────────────────────────────────────────

function PackagesList({ packages, colors }: { packages: CoachPackage[]; colors: CoachThemeColors }) {
  return (
    <View style={[packagesStyles.wrap, { borderTopColor: colors.border }]}>
      <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.md, paddingHorizontal: spacing.lg }]}>
        Packages
      </Text>
      {packages.map((pkg) => {
        const promoOn = pkg.promo_active && isPromoInRange(pkg.promo_starts_at, pkg.promo_ends_at);
        return (
          <View
            key={pkg.id}
            style={[packagesStyles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            {/* Promo badge */}
            {promoOn && pkg.promo_label && (
              <View style={packagesStyles.promoBadgeRow}>
                <View style={[packagesStyles.promoBadge, { backgroundColor: '#FFD600' }]}>
                  <Text style={packagesStyles.promoBadgeText}>{pkg.promo_label.toUpperCase()}</Text>
                </View>
                {pkg.featured && (
                  <View style={[packagesStyles.featuredPill, { borderColor: colors.primary }]}>
                    <Text style={[packagesStyles.featuredPillText, { color: colors.primary }]}>FEATURED</Text>
                  </View>
                )}
              </View>
            )}

            {/* Title + price row */}
            <View style={packagesStyles.titleRow}>
              <Text style={[typography.body, { color: colors.text, fontWeight: '700', flex: 1 }]}>
                {pkg.title}
              </Text>
              <Text style={[typography.h4, { color: colors.primary, marginLeft: spacing.md }]}>
                ${pkg.price % 1 === 0 ? pkg.price.toFixed(0) : pkg.price.toFixed(2)}
                <Text style={[typography.caption, { color: colors.textSubtle, fontWeight: '400' }]}> NZD</Text>
              </Text>
            </View>

            {/* Duration */}
            {pkg.duration && (
              <Text style={[typography.caption, { color: colors.textSubtle, marginTop: spacing.xs }]}>
                {pkg.duration}
              </Text>
            )}
          </View>
        );
      })}
    </View>
  );
}

const packagesStyles = StyleSheet.create({
  wrap: {
    borderTopWidth: 1,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  card: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
  },
  promoBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  promoBadge: {
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  promoBadgeText: {
    fontFamily: 'JetBrainsMono_Regular',
    fontSize: 10,
    fontWeight: '800',
    color: '#000000',
    letterSpacing: 0.5,
  },
  featuredPill: {
    borderRadius: radius.sm,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  featuredPillText: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
});

// ── GalleryRow sub-component ───────────────────────────────────────────────

function GalleryRow({
  photos,
  colors,
  screenWidth,
}: {
  photos: CoachGalleryPhoto[];
  colors: CoachThemeColors;
  screenWidth: number;
}) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const TILE_SIZE = 280;

  return (
    <View style={galleryStyles.wrap}>
      <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.md, paddingHorizontal: spacing.lg }]}>
        Gallery
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: 12 }}
        style={{ marginBottom: spacing.lg }}
      >
        {photos.map((photo, idx) => (
          <Pressable key={photo.id} onPress={() => setLightboxIndex(idx)}>
            <Image
              source={{ uri: photo.public_url }}
              style={{ width: TILE_SIZE, height: TILE_SIZE, borderRadius: radius.lg }}
              contentFit="cover"
              transition={200}
            />
          </Pressable>
        ))}
      </ScrollView>

      {/* Fullscreen lightbox */}
      <Modal
        visible={lightboxIndex !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setLightboxIndex(null)}
      >
        <View style={galleryStyles.lightboxBg}>
          <TouchableOpacity
            style={galleryStyles.lightboxClose}
            onPress={() => setLightboxIndex(null)}
            hitSlop={{ top: 16, right: 16, bottom: 16, left: 16 }}
          >
            <Text style={galleryStyles.lightboxCloseText}>✕</Text>
          </TouchableOpacity>

          {lightboxIndex !== null && (
            <FlatList
              data={photos}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              initialScrollIndex={lightboxIndex}
              getItemLayout={(_data, index) => ({ length: screenWidth, offset: screenWidth * index, index })}
              keyExtractor={(p) => p.id}
              renderItem={({ item }) => (
                <View style={{ width: screenWidth, justifyContent: 'center', alignItems: 'center' }}>
                  <Image
                    source={{ uri: item.public_url }}
                    style={{ width: screenWidth, height: screenWidth }}
                    contentFit="contain"
                    transition={200}
                  />
                </View>
              )}
            />
          )}
        </View>
      </Modal>
    </View>
  );
}

const galleryStyles = StyleSheet.create({
  wrap: {
    paddingTop: spacing.md,
  },
  lightboxBg: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  lightboxClose: {
    position: 'absolute',
    top: 52,
    right: 20,
    zIndex: 10,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 999,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lightboxCloseText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});

// ── Component ──────────────────────────────────────────────────────────────

export function CoachProfileView({
  coach,
  colors,
  isBookable: _isBookable = false,
  stats,
  startingPrice,
  onBookPress,
  containerWidth,
}: CoachProfileViewProps) {
  const screenWidth = containerWidth ?? Dimensions.get('window').width;
  const HERO_HEIGHT = Math.round(screenWidth * (5 / 4));

  // Scroll ref + packages section Y offset for Book A Session scroll action
  const scrollViewRef = useRef<ScrollView>(null);
  const packagesOffsetY = useRef<number>(0);

  const open = (url: string) => Linking.openURL(url).catch(() => {});

  // Role label — DB-managed roles take priority over legacy booleans.
  //
  // Rendering rules (spec from PRD v0.5 / Issue #16-db-roles):
  //   1 role  → "PERSONAL TRAINER"
  //   2 roles → "PERSONAL TRAINER & NUTRITIONIST"
  //   3+ roles → "PERSONAL TRAINER, NUTRITIONIST & 2 MORE"
  //   0 / null → fall back to legacy boolean logic → specialty[0] → 'COACH'
  let roleLabel: string;
  const assignedRoles = coach.roles ?? [];
  if (assignedRoles.length === 1) {
    roleLabel = assignedRoles[0].toUpperCase();
  } else if (assignedRoles.length === 2) {
    roleLabel = `${assignedRoles[0].toUpperCase()} & ${assignedRoles[1].toUpperCase()}`;
  } else if (assignedRoles.length >= 3) {
    const remainder = assignedRoles.length - 2;
    roleLabel = `${assignedRoles[0].toUpperCase()}, ${assignedRoles[1].toUpperCase()} & ${remainder} MORE`;
  } else {
    // Legacy boolean fallback (supports coaches not yet migrated to new roles)
    roleLabel = coach.is_nutritionist
      ? 'PERFORMANCE NUTRITIONIST'
      : coach.is_personal_trainer
      ? 'PERSONAL TRAINER'
      : (coach.specialties?.[0] ?? '').toUpperCase() || 'COACH';
  }

  // Specialty pills
  const specialtyPills: string[] = [];
  if (coach.is_personal_trainer) specialtyPills.push('Personal Training');
  if (coach.is_nutritionist) specialtyPills.push('Nutrition');
  (coach.specialties ?? []).forEach((s) => {
    if (!specialtyPills.some((p) => p.toLowerCase() === s.toLowerCase())) {
      specialtyPills.push(s);
    }
  });

  const locations: string[] = [...(coach.regions ?? [])];
  if (coach.online_remote) locations.push('Online / Remote');

  const socials = [
    coach.website
      ? { icon: 'globe-outline' as const, label: 'Website', value: coach.website, onPress: () => open(coach.website!.startsWith('http') ? coach.website! : `https://${coach.website}`) }
      : null,
    coach.instagram
      ? { icon: 'logo-instagram' as const, label: 'Instagram', value: `@${coach.instagram}`, onPress: () => open(`https://instagram.com/${coach.instagram!.replace(/^@/, '')}`) }
      : null,
    coach.tiktok
      ? { icon: 'logo-tiktok' as const, label: 'TikTok', value: `@${coach.tiktok}`, onPress: () => open(`https://tiktok.com/@${coach.tiktok!.replace(/^@/, '')}`) }
      : null,
    coach.facebook
      ? { icon: 'logo-facebook' as const, label: 'Facebook', value: coach.facebook, onPress: () => open(coach.facebook!.startsWith('http') ? coach.facebook! : `https://facebook.com/${coach.facebook}`) }
      : null,
    coach.youtube
      ? { icon: 'logo-youtube' as const, label: 'YouTube', value: coach.youtube, onPress: () => open(coach.youtube!) }
      : null,
  ].filter(Boolean);

  // Book A Session = scroll-to-packages action (not a booking/payment flow). Always enabled when packages exist.
  const hasPackages = (coach.packages?.length ?? 0) > 0;

  function handleBookPress() {
    // If caller passed an explicit handler, prefer that (e.g. CoachDetailScreen in
    // future flows). Otherwise scroll to the packages section.
    if (onBookPress) {
      onBookPress();
      return;
    }
    scrollViewRef.current?.scrollTo({ y: packagesOffsetY.current, animated: true });
  }

  return (
    <ScrollView
      ref={scrollViewRef}
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ paddingBottom: hasPackages ? spacing.xxl * 4 : spacing.xxl * 2 }}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Hero with gradient overlay ──────────────────────────── */}
      <View style={[styles.heroWrap, { width: screenWidth, height: HERO_HEIGHT }]}>
        {coach.photo_url ? (
          <Image
            source={{ uri: coach.photo_url }}
            style={styles.heroImage}
            contentFit="cover"
            transition={300}
          />
        ) : (
          <View style={[styles.heroImage, { backgroundColor: colors.surfaceAlt, justifyContent: 'center', alignItems: 'center' }]}>
            <Ionicons name="person" size={96} color={colors.primary + '44'} />
          </View>
        )}

        {/* Gradient simulation */}
        <View style={[styles.heroGradientBase, { backgroundColor: colors.background, height: HERO_HEIGHT * 0.36 }]} />
        <View style={[styles.heroGradientMid, { bottom: HERO_HEIGHT * 0.20, height: HERO_HEIGHT * 0.28 }]} />
        <View style={[styles.heroGradientTop, { bottom: HERO_HEIGHT * 0.40, height: HERO_HEIGHT * 0.20 }]} />

        <View style={styles.heroNameBlock}>
          <Text style={[typography.overline, styles.roleOverline, { color: colors.primary }]}>
            {roleLabel}
          </Text>
          <Text style={[typography.h1, styles.heroName, { color: '#FFFFFF' }]}>
            {coach.name}
          </Text>
          {locations.length > 0 && (
            <View style={styles.heroLocationRow}>
              <Ionicons name="location" size={13} color={colors.primary} />
              <Text style={[typography.caption, { color: 'rgba(255,255,255,0.75)', marginLeft: 4 }]}>
                {locations.join(' · ')}
              </Text>
            </View>
          )}
          {startingPrice !== null && startingPrice !== undefined && (
            <View style={styles.pricePill}>
              <Text style={styles.pricePillText}>${startingPrice} /SESSION</Text>
            </View>
          )}
        </View>
      </View>

      {/* ── Stats row ─────────────────────────────────────────────── */}
      {stats && stats.length > 0 && (
        <View style={[styles.statsRow, { borderBottomColor: colors.border }]}>
          {stats.map((stat, i) => (
            <React.Fragment key={stat.label}>
              <View style={styles.statCell}>
                <Text style={[typography.h3, { color: colors.primary }]}>{stat.value}</Text>
                <Text style={[typography.caption, { color: colors.textSubtle, marginTop: 2 }]}>
                  {stat.label}
                </Text>
              </View>
              {i < stats.length - 1 && (
                <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
              )}
            </React.Fragment>
          ))}
        </View>
      )}

      {/* ── Specialties ──────────────────────────── */}
      {specialtyPills.length > 0 && (
        <View style={styles.specialtyGrid}>
          {specialtyPills.map((pill) => (
            <View
              key={pill}
              style={[styles.specialtyCell, { backgroundColor: colors.surface, borderColor: colors.border }]}
            >
              <Ionicons
                name={specialtyIcon(pill) as any}
                size={16}
                color={colors.primary}
                style={{ marginRight: spacing.sm }}
              />
              <Text style={[typography.caption, { color: colors.text, fontWeight: '600', letterSpacing: 0.8 }]}>
                {pill.toUpperCase()}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* ── Packages ──────────────────────────────────────────────── */}
      {coach.packages && coach.packages.length > 0 && (
        <View
          onLayout={(e) => { packagesOffsetY.current = e.nativeEvent.layout.y; }}
        >
          <PackagesList packages={coach.packages} colors={colors} />
        </View>
      )}

      {/* ── Members deal card — hidden when no deal or toggle off ── */}
      {(coach.members_deal_active !== false) && coach.members_deal && (
        <View style={[styles.dealCard, { backgroundColor: colors.primary + '12', borderColor: colors.primary }]}>
          <View style={styles.dealCardHeader}>
            <Ionicons name="pricetag" size={14} color={colors.primary} />
            <Text style={[typography.overline, { color: colors.primary, marginLeft: 6 }]}>
              MEMBERS DEAL
            </Text>
          </View>
          <Text style={[typography.body, { color: colors.text, marginTop: spacing.xs, fontWeight: '600' }]}>
            {coach.members_deal}
          </Text>
          {coach.coupon_code && (
            <View style={[styles.couponRow, { borderTopColor: colors.primary + '30' }]}>
              <Text style={[typography.caption, { color: colors.textMuted }]}>Use code</Text>
              <View style={[styles.couponBadge, { backgroundColor: colors.primary }]}>
                <Text style={[typography.mono, { color: '#000000', fontSize: 13, fontWeight: '700' }]}>
                  {coach.coupon_code}
                </Text>
              </View>
            </View>
          )}
        </View>
      )}

      {/* ── About ─────────────────────────────────────────────────── */}
      {coach.bio && (
        <View style={styles.section}>
          <View style={[styles.aboutCard, { borderColor: colors.border, backgroundColor: colors.surface }]}>
            <Text style={[typography.h4, styles.sectionTitle, { color: colors.text }]}>About</Text>
            <Text style={[typography.body, { color: colors.textMuted, lineHeight: 24 }]}>
              {coach.bio}
            </Text>
          </View>
        </View>
      )}

      {/* ── Gallery ──────────────────────────────────────────────── */}
      {coach.gallery_photos && coach.gallery_photos.length > 0 && (
        <GalleryRow photos={coach.gallery_photos} colors={colors} screenWidth={screenWidth} />
      )}

      {/* ── Qualifications ─────────────────────────────────────────── */}
      {coach.qualifications && (
        <View style={styles.section}>
          <View style={[styles.sectionDivider, { backgroundColor: colors.border }]} />
          <Text style={[typography.h4, styles.sectionTitle, { color: colors.text }]}>Qualifications</Text>
          {coach.qualifications.split('·').map((q, i) => {
            const trimmed = q.trim();
            if (!trimmed) return null;
            return (
              <View key={i} style={styles.credentialRow}>
                <View style={[styles.credentialDot, { backgroundColor: colors.primary }]} />
                <Text style={[typography.bodySmall, { color: colors.textMuted, flex: 1 }]}>
                  {trimmed}
                </Text>
              </View>
            );
          })}
        </View>
      )}

      {/* ── Achievements ─────────────────────────────────────────── */}
      {coach.achievements && (
        <View style={styles.section}>
          <View style={[styles.sectionDivider, { backgroundColor: colors.border }]} />
          <Text style={[typography.h4, styles.sectionTitle, { color: colors.text }]}>Achievements</Text>
          {coach.achievements.split('·').map((a, i) => {
            const trimmed = a.trim();
            if (!trimmed) return null;
            return (
              <View key={i} style={styles.credentialRow}>
                <Ionicons name="trophy-outline" size={14} color={colors.primary} style={{ marginTop: 2 }} />
                <Text style={[typography.bodySmall, { color: colors.textMuted, flex: 1, marginLeft: spacing.sm }]}>
                  {trimmed}
                </Text>
              </View>
            );
          })}
        </View>
      )}

      {/* ── Contact ───────────────────────────────────────────────── */}
      {(coach.email || coach.phone) && (
        <View style={styles.section}>
          <View style={[styles.sectionDivider, { backgroundColor: colors.border }]} />
          <Text style={[typography.h4, styles.sectionTitle, { color: colors.text }]}>Contact</Text>
          {coach.email && (
            <Pressable
              style={[styles.contactRow, { borderColor: colors.border }]}
              onPress={() => open(`mailto:${coach.email}`)}
            >
              <View style={[styles.contactIconBox, { backgroundColor: colors.primary + '18' }]}>
                <Ionicons name="mail-outline" size={16} color={colors.primary} />
              </View>
              <Text style={[typography.body, { color: colors.text, marginLeft: spacing.md, flex: 1 }]}>
                {coach.email}
              </Text>
              <Ionicons name="chevron-forward" size={16} color={colors.textSubtle} />
            </Pressable>
          )}
          {coach.phone && (
            <Pressable
              style={[styles.contactRow, { borderColor: colors.border }]}
              onPress={() => open(`tel:${coach.phone}`)}
            >
              <View style={[styles.contactIconBox, { backgroundColor: colors.primary + '18' }]}>
                <Ionicons name="call-outline" size={16} color={colors.primary} />
              </View>
              <Text style={[typography.body, { color: colors.text, marginLeft: spacing.md, flex: 1 }]}>
                {coach.phone}
              </Text>
              <Ionicons name="chevron-forward" size={16} color={colors.textSubtle} />
            </Pressable>
          )}
        </View>
      )}

      {/* ── Socials ───────────────────────────────────────────────── */}
      {socials.length > 0 && (
        <View style={styles.section}>
          <View style={[styles.sectionDivider, { backgroundColor: colors.border }]} />
          <Text style={[typography.h4, styles.sectionTitle, { color: colors.text }]}>Follow</Text>
          {socials.map((s) =>
            s ? (
              <Pressable
                key={s.label}
                style={[styles.contactRow, { borderColor: colors.border }]}
                onPress={s.onPress}
              >
                <View style={[styles.contactIconBox, { backgroundColor: colors.primary + '18' }]}>
                  <Ionicons name={s.icon} size={16} color={colors.primary} />
                </View>
                <Text
                  style={[typography.body, { color: colors.text, marginLeft: spacing.md, flex: 1 }]}
                  numberOfLines={1}
                >
                  {s.value}
                </Text>
                <Ionicons name="open-outline" size={16} color={colors.textSubtle} />
              </Pressable>
            ) : null,
          )}
        </View>
      )}

      {/* ── Book CTA ─────────────────────────────────────────────── */}
      {/* Book A Session = scroll-to-packages action (not a booking/payment flow). Always enabled when packages exist. */}
      {hasPackages && (
        <View style={[styles.ctaBar, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
          <Pressable
            onPress={handleBookPress}
            style={({ pressed }) => [
              styles.ctaBtn,
              { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <Ionicons name="calendar-outline" size={20} color="#000000" style={{ marginRight: spacing.sm }} />
            <Text style={[typography.button, { color: '#000000', letterSpacing: 0.5 }]}>
              BOOK A SESSION
            </Text>
          </Pressable>
        </View>
      )}
    </ScrollView>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Hero
  heroWrap: { position: 'relative' },
  heroImage: { width: '100%', height: '100%' },
  heroGradientBase: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 1,
  },
  heroGradientMid: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  heroGradientTop: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  heroNameBlock: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    bottom: spacing.lg,
  },
  roleOverline: {
    letterSpacing: 1.4,
    marginBottom: spacing.xs,
  },
  heroName: {
    color: '#FFFFFF',
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  heroLocationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  pricePill: {
    alignSelf: 'flex-start',
    backgroundColor: '#ffd600',
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginTop: spacing.sm,
  },
  pricePillText: {
    fontFamily: 'JetBrainsMono_Regular',
    fontSize: 15,
    fontWeight: '800',
    color: '#000000',
    letterSpacing: -0.5,
    textTransform: 'uppercase',
  },

  // Stats
  statsRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
    marginBottom: spacing.md,
  },
  statCell: { flex: 1, alignItems: 'center' },
  statDivider: { width: 1, marginVertical: 4 },

  // Specialties
  specialtyGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  specialtyCell: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '48%',
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
  },

  // Deal card
  dealCard: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1.5,
  },
  dealCardHeader: { flexDirection: 'row', alignItems: 'center' },
  couponRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
  },
  couponBadge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
  },

  // About card
  aboutCard: { borderWidth: 1, borderRadius: radius.lg, padding: spacing.lg },

  // Sections
  section: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg },
  sectionDivider: { height: 1, marginBottom: spacing.lg },
  sectionTitle: { marginBottom: spacing.md },
  credentialRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: spacing.sm },
  credentialDot: { width: 6, height: 6, borderRadius: 3, marginTop: 6, marginRight: spacing.md },

  // Contact / socials
  contactRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md, borderBottomWidth: 1 },
  contactIconBox: { width: 34, height: 34, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },

  // CTA
  ctaBar: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderTopWidth: 1 },
  ctaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.lg,
    borderRadius: radius.lg,
    shadowColor: '#ffd600',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 12,
    elevation: 8,
  },
});
