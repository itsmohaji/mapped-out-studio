'use client';

import React, { useCallback, useMemo, useState } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import useSWR, { mutate as globalMutate } from 'swr';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useUser } from '@gitroom/frontend/components/layout/user.context';
import { Input } from '@gitroom/react/form/input';
import { Button } from '@gitroom/react/form/button';
import { useMediaDirectory } from '@gitroom/react/helpers/use.media.directory';
import ModeComponent from '@gitroom/frontend/components/layout/mode.component';
import LanguageToggle from '@gitroom/frontend/components/settings/language.toggle';

interface Personal {
  id: string;
  name?: string | null;
  bio?: string | null;
  picture?: { id: string; path: string } | null;
}

const usePersonal = () => {
  const fetch = useFetch();
  const load = useCallback(async () => {
    return (await fetch('/user/personal')).json();
  }, []);
  return useSWR<Personal>('personal-account', load, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
  });
};

const AccountComponent = () => {
  const t = useT();
  const fetch = useFetch();
  const toaster = useToaster();
  const user = useUser();
  const mediaDirectory = useMediaDirectory();
  const { data: personal, mutate } = usePersonal();

  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const profileForm = useForm({
    values: { fullname: personal?.name || user?.name || '' },
  });
  const passwordForm = useForm({
    defaultValues: { password: '', newPassword: '', confirmPassword: '' },
  });

  const initials = useMemo(() => {
    const source = (personal?.name || user?.name || user?.email || '?').trim();
    return source.slice(0, 1).toUpperCase();
  }, [personal?.name, user?.name, user?.email]);

  const isLocalAccount = user?.providerName === 'LOCAL';

  const saveProfile = useCallback(
    async (values: { fullname: string }) => {
      setSavingProfile(true);
      try {
        // Round-trip the existing picture so saving the name never disconnects the avatar.
        const res = await fetch('/user/personal', {
          method: 'POST',
          body: JSON.stringify({
            fullname: values.fullname,
            bio: personal?.bio ?? undefined,
            picture: personal?.picture
              ? { id: personal.picture.id, path: personal.picture.path }
              : undefined,
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({} as any));
          toaster.show(err?.message || t('save_failed', 'Could not save'), 'warning');
          return;
        }
        await mutate();
        // The top-right account menu reads the user from the CLIENT SWR key
        // '/user/self' (LayoutComponent), not from a server render — so
        // router.refresh() never updated it. Revalidate that key instead.
        await globalMutate('/user/self');
        toaster.show(t('profile_saved', 'Profile saved'), 'success');
      } finally {
        setSavingProfile(false);
      }
    },
    [fetch, personal?.bio, personal?.picture, mutate, toaster, t]
  );

  const savePassword = useCallback(
    async (values: {
      password: string;
      newPassword: string;
      confirmPassword: string;
    }) => {
      if (values.newPassword !== values.confirmPassword) {
        passwordForm.setError('confirmPassword', {
          message: t('passwords_do_not_match', 'Passwords do not match'),
        });
        return;
      }
      setSavingPassword(true);
      try {
        const res = await fetch('/user/change-password', {
          method: 'POST',
          body: JSON.stringify({
            password: values.password,
            newPassword: values.newPassword,
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({} as any));
          toaster.show(
            err?.message || t('password_change_failed', 'Could not change password'),
            'warning'
          );
          return;
        }
        passwordForm.reset({
          password: '',
          newPassword: '',
          confirmPassword: '',
        });
        setShowPassword(false);
        toaster.show(t('password_changed', 'Password changed'), 'success');
      } finally {
        setSavingPassword(false);
      }
    },
    [fetch, passwordForm, toaster, t]
  );

  return (
    <div className="flex flex-col gap-[16px]">
      <div className="text-[18px] font-[600]">{t('account', 'Account')}</div>

      {/* Profile */}
      <div className="glass-surface rounded-[12px] p-[20px] flex flex-col gap-[16px]">
        <div className="flex items-center gap-[16px]">
          <div className="w-[64px] h-[64px] rounded-full overflow-hidden bg-forth flex items-center justify-center text-[24px] font-[600] text-white shrink-0">
            {personal?.picture?.path ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={mediaDirectory.set(personal.picture.path)}
                alt={t('avatar', 'Avatar')}
                className="w-full h-full object-cover"
              />
            ) : (
              <span>{initials}</span>
            )}
          </div>
          <div className="flex flex-col">
            <div className="text-[15px] font-[600]">
              {personal?.name || user?.name || user?.email}
            </div>
            <div className="text-[12px] text-textItemBlur">
              {t('profile_photo_hint', 'Profile photo uploading is coming soon')}
            </div>
          </div>
        </div>

        <FormProvider {...profileForm}>
          <form
            onSubmit={profileForm.handleSubmit(saveProfile)}
            className="flex flex-col gap-[12px]"
          >
            <Input
              label={t('full_name', 'Full name')}
              name="fullname"
              placeholder={t('full_name', 'Full name')}
              autoComplete="name"
            />
            <div className="flex flex-col gap-[6px]">
              <div className="text-[14px]">{t('email', 'Email')}</div>
              <div className="bg-newBgColorInner h-[42px] border-newTableBorder border rounded-[8px] text-textItemBlur flex items-center px-[16px] text-[14px]">
                {user?.email}
              </div>
              <div className="text-[12px] text-textItemBlur">
                {t('email_login_hint', 'Your email is used to sign in and cannot be changed here')}
              </div>
            </div>
            <div>
              <Button type="submit" loading={savingProfile}>
                {t('save', 'Save')}
              </Button>
            </div>
          </form>
        </FormProvider>
      </div>

      {/* Appearance: theme + language */}
      <div className="glass-surface rounded-[12px] p-[20px] flex flex-col gap-[16px]">
        <div className="text-[15px] font-[600]">
          {t('appearance', 'Appearance')}
        </div>
        <div className="flex items-center justify-between gap-[12px] flex-wrap">
          <div>
            <div className="text-[14px] font-[600]">{t('theme', 'Theme')}</div>
            <div className="text-[12px] text-textItemBlur mt-[2px]">
              {t('theme_help', 'Light, dark, or match your system')}
            </div>
          </div>
          <ModeComponent variant="segmented" />
        </div>
        <div className="flex items-center justify-between gap-[12px] flex-wrap">
          <div>
            <div className="text-[14px] font-[600]">{t('language', 'Language')}</div>
            <div className="text-[12px] text-textItemBlur mt-[2px]">
              {t('language_help', 'Choose your interface language')}
            </div>
          </div>
          <LanguageToggle />
        </div>
      </div>

      {/* Change password — collapsed behind a button */}
      <div className="glass-surface rounded-[12px] p-[20px] flex flex-col gap-[16px]">
        <div className="flex items-center justify-between gap-[12px]">
          <div className="text-[15px] font-[600]">
            {t('change_password', 'Change password')}
          </div>
          {isLocalAccount && !showPassword && (
            <Button type="button" secondary onClick={() => setShowPassword(true)}>
              {t('change_password', 'Change password')}
            </Button>
          )}
        </div>
        {!isLocalAccount ? (
          <div className="text-[13px] text-textItemBlur">
            {t(
              'password_social_hint',
              'You signed in with a social account, so there is no password to change.'
            )}
          </div>
        ) : showPassword ? (
          <FormProvider {...passwordForm}>
            <form
              onSubmit={passwordForm.handleSubmit(savePassword)}
              className="flex flex-col gap-[12px]"
            >
              <Input
                label={t('current_password', 'Current password')}
                name="password"
                type="password"
                autoComplete="current-password"
              />
              <Input
                label={t('new_password', 'New password')}
                name="newPassword"
                type="password"
                autoComplete="new-password"
              />
              <Input
                label={t('confirm_password', 'Confirm new password')}
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
              />
              <div className="flex items-center gap-[12px]">
                <Button type="submit" loading={savingPassword}>
                  {t('update_password', 'Update password')}
                </Button>
                <button
                  type="button"
                  onClick={() => {
                    setShowPassword(false);
                    passwordForm.reset({
                      password: '',
                      newPassword: '',
                      confirmPassword: '',
                    });
                  }}
                  className="text-[13px] text-textItemBlur hover:underline"
                >
                  {t('cancel', 'Cancel')}
                </button>
              </div>
            </form>
          </FormProvider>
        ) : null}
      </div>
    </div>
  );
};

export default AccountComponent;
