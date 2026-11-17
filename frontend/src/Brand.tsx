import { cx, ui } from './ui/styles';
export default function Brand() {
  return <div data-ui="procon-brand" className={cx(ui.proconBrand)} aria-label="PROCON São Paulo, Jacareí">
    <div data-ui="brand-name" className={cx(ui.brandName)} aria-hidden="true">PROCON<span>SP</span></div>
    <div data-ui="brand-city" className={cx(ui.brandCity)} aria-hidden="true">Jacareí</div>
  </div>;
}
