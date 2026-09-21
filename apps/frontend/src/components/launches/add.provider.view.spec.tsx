/**
 * @jest-environment ./jest.jsdom.env.cjs
 */
/**
 * Owner, 2026-09-21: choosing an Instagram/LinkedIn account type must happen
 * INSIDE the Add Channel modal — never a second modal stacked on top (second
 * overlay, second focus trap, second body lock).
 */
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';

const openModal = jest.fn();
const fetchMock = jest.fn(async () => ({ json: async () => ({ url: 'https://oauth.example/start' }) }));

jest.mock('@gitroom/frontend/components/layout/new-modal', () => ({
  useModals: () => ({ openModal, closeAll: jest.fn() }),
}));
jest.mock('@gitroom/helpers/utils/custom.fetch', () => ({ useFetch: () => fetchMock }));
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('@gitroom/react/helpers/variable.context', () => ({
  useVariables: () => ({ isGeneral: true, extensionId: '' }),
}));
jest.mock('@gitroom/react/toaster/toaster', () => ({ useToaster: () => ({ show: jest.fn() }) }));
jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (_k: string, d: string) => d,
}));
jest.mock('@gitroom/frontend/components/launches/web3/web3.list', () => ({ web3List: [] }));
jest.mock('@gitroom/react/form/input', () => ({ Input: () => null }));
jest.mock('@gitroom/react/form/button', () => ({ Button: () => null }));
jest.mock('@gitroom/frontend/components/launches/helpers/top.title.component', () => ({ TopTitle: () => null }));

import { AddProviderComponent } from '@gitroom/frontend/components/launches/add.provider.component';

const social = [
  'x', 'linkedin', 'linkedin-page', 'instagram-standalone', 'instagram', 'facebook',
  'threads', 'youtube', 'tiktok', 'pinterest', 'wordpress', 'reddit',
].map((identifier) => ({
  identifier,
  name: identifier,
  isExternal: identifier === 'wordpress',
  isWeb3: false,
}));

const renderPicker = () =>
  render(<AddProviderComponent social={social as any} article={[]} invite={false} />);
const cards = () => [...document.querySelectorAll('[data-group]')];
const options = () => [...document.querySelectorAll('[data-option]')];

beforeEach(() => {
  openModal.mockReset();
  fetchMock.mockClear();
});

describe('Add Channel view state', () => {
  it('starts on the 9-platform grid', () => {
    renderPicker();
    expect(cards()).toHaveLength(9);
    expect(options()).toHaveLength(0);
  });

  it.each([
    ['instagram', ['Instagram account', 'Instagram Business via Facebook']],
    ['linkedin', ['Personal profile', 'Company Page']],
  ])('%s swaps the content in place — no second modal', (key, labels) => {
    renderPicker();
    fireEvent.click(document.querySelector(`[data-group="${key}"]`)!);
    expect(openModal).not.toHaveBeenCalled();
    expect(cards()).toHaveLength(0); // grid replaced, not stacked
    expect(options().map((o) => o.textContent)).toEqual(
      labels.map((l) => expect.stringContaining(l))
    );
    expect(screen.getByText('Back')).toBeTruthy();
  });

  it('puts keyboard focus on the first account type, and Back returns focus to the platform', () => {
    renderPicker();
    fireEvent.click(document.querySelector('[data-group="instagram"]')!);
    expect(document.activeElement).toBe(options()[0]);

    fireEvent.click(screen.getByText('Back'));
    expect(cards()).toHaveLength(9);
    expect(document.activeElement).toBe(document.querySelector('[data-group="instagram"]'));
    expect(openModal).not.toHaveBeenCalled();
  });

  it('resets to the grid when the modal is closed and reopened (unmount + mount)', () => {
    const first = renderPicker();
    fireEvent.click(document.querySelector('[data-group="linkedin"]')!);
    expect(options()).toHaveLength(2);
    first.unmount();

    renderPicker();
    expect(cards()).toHaveLength(9);
    expect(options()).toHaveLength(0);
  });

  it('a single-option platform goes straight to its connect flow, no chooser', async () => {
    renderPicker();
    await act(async () => {
      fireEvent.click(document.querySelector('[data-group="facebook"]')!);
    });
    expect(options()).toHaveLength(0);
    expect(openModal).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith(expect.stringMatching(/^\/integrations\/social\/facebook/));
  });

  it('an account type starts that provider\'s connect flow', async () => {
    renderPicker();
    fireEvent.click(document.querySelector('[data-group="instagram"]')!);
    await act(async () => {
      fireEvent.click(options()[1]);
    });
    expect(fetchMock).toHaveBeenCalledWith(expect.stringMatching(/^\/integrations\/social\/instagram(\?|$)/));
    expect(openModal).not.toHaveBeenCalled();
  });

  it('never offers an unsupported platform even if the API lists it', () => {
    renderPicker();
    expect(document.querySelector('[data-group="reddit"]')).toBeNull();
  });
});
