export const DEFAULT_PROFILE_IMAGE =
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200';

type MaybeProfileImageShape = {
  image_url?: string | null;
  imageUrl?: string | null;
  photos?: Array<string | null> | null;
  images?: Array<string | null> | null;
};

const ALLOWED_IMAGE_HOSTS = [
  'qtihezzbuubnyvrjdkjd.supabase.co',
  'lh3.googleusercontent.com',
  'images.unsplash.com',
  'randomuser.me',
];

const isUsableUrl = (value: string | null | undefined): value is string => {
  if (typeof value !== 'string' || value.trim().length === 0) return false;
  try {
    const url = new URL(value);
    return ALLOWED_IMAGE_HOSTS.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`));
  } catch {
    return false;
  }
};

export const resolveProfileImage = (profile: MaybeProfileImageShape | null | undefined): string => {
  if (!profile) {
    return DEFAULT_PROFILE_IMAGE;
  }

  const candidates = [
    profile.image_url,
    profile.imageUrl,
    profile.photos?.find(isUsableUrl),
    profile.images?.find(isUsableUrl),
  ];

  return candidates.find(isUsableUrl) ?? DEFAULT_PROFILE_IMAGE;
};
