export type AuthenticatedUser = {
  id: string;
  googleSubject: string;
  email: string | null;
  fullName: string | null;
  avatarUrl: string | null;
};

export type GoogleProfile = {
  googleSubject: string;
  email: string | null;
  fullName: string | null;
  avatarUrl: string | null;
};
