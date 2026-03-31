import Purchases, {
  CustomerInfo,
  PRORATION_MODE,
  PurchasesPackage,
  PACKAGE_TYPE,
  SubscriptionOption,
} from 'react-native-purchases';
import { Platform } from 'react-native';

const REVENUECAT_API_KEY_IOS = process.env.EXPO_PUBLIC_REVENUECAT_API_KEY_IOS || '';
const REVENUECAT_API_KEY_ANDROID = process.env.EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID || '';

let isConfigured = false;
let configurePromise: Promise<void> | null = null;

export function isPurchasesConfigured(): boolean {
  return isConfigured;
}

export async function waitForConfiguration(): Promise<boolean> {
  if (isConfigured) return true;
  if (configurePromise) {
    await configurePromise;
    return isConfigured;
  }
  return false;
}

export async function initializePurchases(userId?: string) {
  if (isConfigured) {
    if (userId) {
      try {
        await Purchases.logIn(userId);
      } catch (error) {
        console.warn('Failed to log in user to RevenueCat:', error);
      }
    }
    return;
  }

  if (configurePromise) {
    await configurePromise;
    return;
  }

  configurePromise = (async () => {
    try {
      const apiKey = Platform.OS === 'ios' ? REVENUECAT_API_KEY_IOS : REVENUECAT_API_KEY_ANDROID;

      if (!apiKey) {
        console.warn('RevenueCat API key not configured for', Platform.OS);
        return;
      }

      Purchases.configure({
        apiKey,
        appUserID: userId,
      });

      isConfigured = true;
    } catch (error) {
      console.error('Failed to initialize RevenueCat:', error);
    }
  })();

  await configurePromise;
}

export async function getOfferings(): Promise<PurchasesPackage[]> {
  try {
    const offerings = await Purchases.getOfferings();
    const availablePackages = offerings.current?.availablePackages ?? [];

    if (__DEV__) console.log('[RevenueCat] current offering:', offerings.current?.identifier ?? 'none');
    availablePackages.forEach((pkg) => {
      if (__DEV__) console.log('[RevenueCat] package', {
        identifier: pkg.identifier,
        packageType: String(pkg.packageType),
        productIdentifier: pkg.product.identifier,
        priceString: pkg.product.priceString,
      });
    });

    if (!offerings.current) {
      if (__DEV__) console.warn('[RevenueCat] No current offering configured');
    }

    return availablePackages;
  } catch (error) {
    console.error('[RevenueCat] Failed to get offerings:', error);
    return [];
  }
}

type PlanFamily = 'celestial' | 'cosmic';
type BillingCycle = 'monthly' | 'annual';

function matchesFamily(pkg: PurchasesPackage, family: PlanFamily): boolean {
  const id = pkg.identifier.toLowerCase();
  const productId = pkg.product.identifier.toLowerCase();

  return id.includes(family) || productId.includes(family);
}

function matchesBillingCycle(pkg: PurchasesPackage, cycle: BillingCycle): boolean {
  if (cycle === 'monthly' && pkg.packageType === PACKAGE_TYPE.MONTHLY) {
    return true;
  }

  if (cycle === 'annual' && pkg.packageType === PACKAGE_TYPE.ANNUAL) {
    return true;
  }

  const id = pkg.identifier.toLowerCase();
  const productId = pkg.product.identifier.toLowerCase();
  const searchable = `${id} ${productId}`;

  if (cycle === 'monthly') {
    return searchable.includes('monthly') || searchable.includes('month');
  }

  return (
    searchable.includes('annual') ||
    searchable.includes('yearly') ||
    searchable.includes('year')
  );
}

export async function getAllTierPackages() {
  const packages = await getOfferings();

  const celestialPackages = packages.filter((pkg) => matchesFamily(pkg, 'celestial'));
  const cosmicPackages = packages.filter((pkg) => matchesFamily(pkg, 'cosmic'));

  if (__DEV__) console.log('[RevenueCat] celestial package ids:', celestialPackages.map((pkg) => ({
    identifier: pkg.identifier,
    packageType: String(pkg.packageType),
    priceString: pkg.product.priceString,
  })));

  if (__DEV__) console.log('[RevenueCat] cosmic package ids:', cosmicPackages.map((pkg) => ({
    identifier: pkg.identifier,
    packageType: String(pkg.packageType),
    priceString: pkg.product.priceString,
  })));

  return {
    celestial: {
      monthly: celestialPackages.find((pkg) => matchesBillingCycle(pkg, 'monthly')) ?? null,
      annual: celestialPackages.find((pkg) => matchesBillingCycle(pkg, 'annual')) ?? null,
      all: celestialPackages,
    },
    cosmic: {
      monthly: cosmicPackages.find((pkg) => matchesBillingCycle(pkg, 'monthly')) ?? null,
      annual: cosmicPackages.find((pkg) => matchesBillingCycle(pkg, 'annual')) ?? null,
      all: cosmicPackages,
    },
  };
}

type PurchasePackageOptions = {
  isUpgrade?: boolean;
  promoCode?: string | null;
  promoCampaignMetadata?: Record<string, unknown> | null;
};

function getActiveSubscriptionIdentifier(
  customerInfo: CustomerInfo,
  nextProductIdentifier: string
): string | null {
  const nextId = nextProductIdentifier.toLowerCase();
  const activeSubscriptions = customerInfo.activeSubscriptions ?? [];

  const upgradeSource =
    activeSubscriptions.find((subscriptionId) => subscriptionId.toLowerCase() !== nextId) ?? null;

  return upgradeSource;
}

export async function purchasePackage(pkg: PurchasesPackage, options: PurchasePackageOptions = {}) {
  try {
    const promoSubscriptionOption =
      Platform.OS === 'android'
        ? getPromoSubscriptionOption(
            pkg,
            options.promoCode ?? null,
            options.promoCampaignMetadata ?? null
          )
        : null;

    if (Platform.OS === 'android' && options.isUpgrade) {
      const currentCustomerInfo = await Purchases.getCustomerInfo();
      const oldProductIdentifier = getActiveSubscriptionIdentifier(
        currentCustomerInfo,
        pkg.product.identifier
      );

      if (oldProductIdentifier) {
        const googleProductChangeInfo = {
          oldProductIdentifier,
          prorationMode: PRORATION_MODE.IMMEDIATE_WITH_TIME_PRORATION,
        };
        const { customerInfo } = promoSubscriptionOption
          ? await Purchases.purchaseSubscriptionOption(
              promoSubscriptionOption,
              googleProductChangeInfo
            )
          : await Purchases.purchasePackage(pkg, undefined, googleProductChangeInfo);

        return { success: true, customerInfo };
      }
    }

    const { customerInfo } = promoSubscriptionOption
      ? await Purchases.purchaseSubscriptionOption(promoSubscriptionOption)
      : await Purchases.purchasePackage(pkg);
    return { success: true, customerInfo };
  } catch (error: any) {
    if (error.userCancelled) {
      return { success: false, cancelled: true };
    }
    return { success: false, error };
  }
}

function getPromoSubscriptionOption(
  pkg: PurchasesPackage,
  promoCode: string | null,
  promoCampaignMetadata: Record<string, unknown> | null
): SubscriptionOption | null {
  if (!promoCode?.trim()) {
    return null;
  }

  const offersValue = promoCampaignMetadata?.offers;
  if (!offersValue || typeof offersValue !== 'object') {
    return null;
  }

  const offerMap = offersValue as Record<string, unknown>;
  const desiredOptionId = offerMap[pkg.product.identifier];
  if (typeof desiredOptionId !== 'string' || !desiredOptionId.trim()) {
    return null;
  }

  const product = pkg.product as PurchasesPackage['product'] & {
    subscriptionOptions?: SubscriptionOption[] | null;
  };
  const subscriptionOptions = product.subscriptionOptions ?? [];

  return subscriptionOptions.find((option) => option.id === desiredOptionId) ?? null;
}

export async function checkPremiumStatus(): Promise<boolean> {
  try {
    const customerInfo = await Purchases.getCustomerInfo();
    return (
      customerInfo.entitlements.active['premium'] !== undefined ||
      customerInfo.entitlements.active['premium_plus'] !== undefined
    );
  } catch {
    return false;
  }
}

export type SubscriptionTier = 'free' | 'premium' | 'premium_plus';

export async function checkSubscriptionTier(): Promise<SubscriptionTier> {
  try {
    const customerInfo = await Purchases.getCustomerInfo();

    if (customerInfo.entitlements.active['premium_plus'] !== undefined) {
      return 'premium_plus';
    }

    if (customerInfo.entitlements.active['premium'] !== undefined) {
      return 'premium';
    }

    return 'free';
  } catch {
    return 'free';
  }
}

export async function restorePurchases() {
  try {
    const customerInfo = await Purchases.restorePurchases();
    const isPremium =
      customerInfo.entitlements.active['premium'] !== undefined ||
      customerInfo.entitlements.active['premium_plus'] !== undefined;
    return { success: true, isPremium };
  } catch {
    return { success: false, isPremium: false };
  }
}

export async function getCustomerInfo(): Promise<CustomerInfo | null> {
  try {
    return await Purchases.getCustomerInfo();
  } catch {
    return null;
  }
}
