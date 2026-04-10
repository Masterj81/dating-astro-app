import { StyleSheet, View } from 'react-native';
import Skeleton from './Skeleton';
import { AppTheme } from '../../constants/theme';

export function DiscoverCardSkeleton() {
  return (
    <View style={skeletonStyles.discoverCard}>
      {/* Card body */}
      <Skeleton width="100%" height={400} borderRadius={AppTheme.radius.xl} />
      {/* Name bar */}
      <View style={skeletonStyles.discoverInfo}>
        <Skeleton width={160} height={24} borderRadius={AppTheme.radius.sm} />
        <View style={skeletonStyles.pillRow}>
          <Skeleton width={80} height={28} borderRadius={AppTheme.radius.pill} />
          <Skeleton width={80} height={28} borderRadius={AppTheme.radius.pill} />
        </View>
      </View>
      {/* Action buttons */}
      <View style={skeletonStyles.actionRow}>
        <Skeleton width={56} height={56} borderRadius={28} />
        <Skeleton width={56} height={56} borderRadius={28} />
        <Skeleton width={56} height={56} borderRadius={28} />
      </View>
    </View>
  );
}

function ListRow({ avatarSize = 48 }: { avatarSize?: number }) {
  return (
    <View style={skeletonStyles.listRow}>
      <Skeleton width={avatarSize} height={avatarSize} borderRadius={avatarSize / 2} />
      <View style={skeletonStyles.listTexts}>
        <Skeleton width={120} height={16} borderRadius={AppTheme.radius.sm} />
        <Skeleton width={180} height={12} borderRadius={AppTheme.radius.sm} />
      </View>
    </View>
  );
}

export function MatchListSkeleton() {
  return (
    <View style={skeletonStyles.listContainer}>
      {Array.from({ length: 5 }).map((_, i) => (
        <ListRow key={i} avatarSize={64} />
      ))}
    </View>
  );
}

export function ChatListSkeleton() {
  return (
    <View style={skeletonStyles.listContainer}>
      {Array.from({ length: 5 }).map((_, i) => (
        <ListRow key={i} avatarSize={48} />
      ))}
    </View>
  );
}

const skeletonStyles = StyleSheet.create({
  discoverCard: {
    padding: AppTheme.spacing.lg,
    gap: AppTheme.spacing.md,
    alignItems: 'center',
  },
  discoverInfo: {
    alignSelf: 'stretch',
    gap: AppTheme.spacing.sm,
    paddingHorizontal: AppTheme.spacing.sm,
  },
  pillRow: {
    flexDirection: 'row',
    gap: AppTheme.spacing.sm,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: AppTheme.spacing.xl,
    marginTop: AppTheme.spacing.sm,
  },
  listContainer: {
    padding: AppTheme.spacing.lg,
    gap: AppTheme.spacing.md,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: AppTheme.spacing.md,
    padding: AppTheme.spacing.md,
    backgroundColor: AppTheme.colors.panel,
    borderRadius: AppTheme.radius.lg,
  },
  listTexts: {
    flex: 1,
    gap: AppTheme.spacing.sm,
  },
});
