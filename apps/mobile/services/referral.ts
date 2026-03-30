import { Share, Platform } from 'react-native';
import { supabase } from './supabase';

export async function getReferralCode(userId: string): Promise<string | null> {
  const { data } = await supabase
    .from('profiles')
    .select('referral_code')
    .eq('id', userId)
    .single();

  return data?.referral_code ?? null;
}

export async function getReferralStats(userId: string) {
  const { data, error } = await supabase.rpc('get_referral_stats', {
    p_user_id: userId,
  });

  if (error || !data) {
    return { code: null, totalReferrals: 0, rewardedReferrals: 0 };
  }

  const row = Array.isArray(data) ? data[0] : data;
  return {
    code: row?.referral_code ?? null,
    totalReferrals: Number(row?.total_referrals ?? 0),
    rewardedReferrals: Number(row?.rewarded_referrals ?? 0),
  };
}

export async function claimReferralCode(code: string) {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    return { success: false, error: 'Not authenticated' };
  }

  const { data, error } = await supabase.functions.invoke('claim-referral', {
    body: { code: code.trim().toUpperCase() },
  });

  if (error) {
    return { success: false, error: error.message };
  }

  if (!data?.success) {
    return { success: false, error: String(data?.error || 'Unable to apply referral code') };
  }

  return { success: true, reward: data.reward };
}

export async function shareReferralCode(code: string, t: (key: string) => string) {
  const message = Platform.select({
    ios: `${t('referralShareMessage') || 'Join me on AstroDating! Use my code'} ${code} ${t('referralShareReward') || 'and we both get 1 month of premium free!'}\n\nhttps://astrodatingapp.com`,
    android: `${t('referralShareMessage') || 'Join me on AstroDating! Use my code'} ${code} ${t('referralShareReward') || 'and we both get 1 month of premium free!'}\n\nhttps://play.google.com/store/apps/details?id=com.astrodatingapp.mobile`,
    default: `${t('referralShareMessage') || 'Join me on AstroDating! Use my code'} ${code} ${t('referralShareReward') || 'and we both get 1 month of premium free!'}\n\nhttps://astrodatingapp.com`,
  });

  try {
    await Share.share({
      message,
      title: t('referralShareTitle') || 'Join AstroDating',
    });
    return true;
  } catch {
    return false;
  }
}
