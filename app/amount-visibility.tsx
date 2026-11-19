'use client';

import { createContext, useContext, useState, type ComponentProps, type ReactNode } from 'react';

const Visibility = createContext({ visible: false, toggle: () => {} });

export function AmountVisibility({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState(false);
  return <Visibility.Provider value={{ visible, toggle: () => setVisible((current) => !current) }}>{children}</Visibility.Provider>;
}

export const useAmountVisibility = () => useContext(Visibility);

export function AmountToggle() {
  const { visible, toggle } = useAmountVisibility();
  return <button type="button" aria-pressed={visible} onClick={toggle} className="workspace-button px-3 py-2 text-sm">{visible ? '隱藏金額' : '顯示金額'}</button>;
}

export function Amount({ value, prefix = '' }: { value: number; prefix?: string }) {
  const { visible } = useAmountVisibility();
  return visible ? <><span className="currency-prefix">{prefix}NT$</span> {value.toLocaleString('zh-TW')}</> : <span aria-label="金額已隱藏">•••</span>;
}

export function AmountInput(props: ComponentProps<'input'>) {
  const { visible } = useAmountVisibility();
  return visible ? <input {...props} type="number" /> : <span className="masked-amount" aria-label="金額已隱藏">•••</span>;
}
