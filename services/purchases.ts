import Purchases, { CustomerInfo, PurchasesPackage } from 'react-native-purchases';

const REVENUECAT_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_API_KEY || '';

// Initialize RevenueCat
export async function initializePurchases(userId?: string) {
  try {
    Purchases.configure({
      apiKey: REVENUECAT_API_KEY,
      appUserID: userId,
    });
  } catch (error) {
  }
}

// Get available packages/subscriptions
export async function getOfferings() {
  try {
    const offerings = await Purchases.getOfferings();
    if (offerings.current) {
      return offerings.current.availablePackages;
    }
    return [];
  } catch (error) {
    return [];
  }
}

// Purchase a package
export async function purchasePackage(pkg: PurchasesPackage) {
  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    return { success: true, customerInfo };
  } catch (error: any) {
    if (error.userCancelled) {
      return { success: false, cancelled: true };
    }
    return { success: false, error };
  }
}

// Check if user has premium access
export async function checkPremiumStatus(): Promise<boolean> {
  try {
    const customerInfo = await Purchases.getCustomerInfo();
    // Check if user has active "premium" or "premium_plus" entitlement
    return (
      customerInfo.entitlements.active['premium'] !== undefined ||
      customerInfo.entitlements.active['premium_plus'] !== undefined
    );
  } catch (error) {
    return false;
  }
}

// Check subscription tier (free, premium, or premium_plus)
export type SubscriptionTier = 'free' | 'premium' | 'premium_plus';

export async function checkSubscriptionTier(): Promise<SubscriptionTier> {
  try {
    const customerInfo = await Purchases.getCustomerInfo();

    // Check for premium_plus first (higher tier)
    if (customerInfo.entitlements.active['premium_plus'] !== undefined) {
      return 'premium_plus';
    }

    // Check for premium
    if (customerInfo.entitlements.active['premium'] !== undefined) {
      return 'premium';
    }

    return 'free';
  } catch (error) {
    return 'free';
  }
}

// Restore purchases
export async function restorePurchases() {
  try {
    const customerInfo = await Purchases.restorePurchases();
    const isPremium = customerInfo.entitlements.active['premium'] !== undefined;
    return { success: true, isPremium };
  } catch (error) {
    return { success: false, isPremium: false };
  }
}

// Get customer info
export async function getCustomerInfo(): Promise<CustomerInfo | null> {
  try {
    return await Purchases.getCustomerInfo();
  } catch (error) {
    return null;
  }
}