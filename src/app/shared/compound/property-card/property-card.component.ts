import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Property } from '../../../core/models';
import { resolveCoverImage } from '../../../core/utils/property-filter.util';
import { sortMediaByOrder } from '../../../core/utils/media-resolver.util';
import { formatCurrency, formatPropertyStatus, formatSquareFeet } from '../../../core/utils/format.util';

/**
 * Editorial listing card.
 *
 * Photography keeps a 4:3 aspect ratio, the cover frame is resolved through
 * {@link resolveCoverImage}, and the specs row is explicitly truncated so long
 * numbers never push the card past its grid track. The component is purely
 * presentational: selecting a residence emits its slug and the owning page owns
 * the navigation.
 */
@Component({
  selector: 'app-property-card',
  standalone: true,
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './property-card.component.html'
})
export class PropertyCardComponent {
  public readonly property = input.required<Property>();
  public readonly currency = input<string>('USD');
  public readonly linkTarget = input<string | null>(null);

  /** Emits the selected property slug. */
  public readonly selected = output<string>();

  protected readonly coverImage = computed(() => resolveCoverImage(this.property().media));
  protected readonly mediaCount = computed(() => sortMediaByOrder(this.property().media).length);
  protected readonly interiorArea = computed(() => formatSquareFeet(this.property().specs.interiorSquareFeet));
  protected readonly statusLabel = computed(() => formatPropertyStatus(this.property().status));
  protected readonly formattedPrice = computed(() => formatCurrency(this.property().price, this.currency()));

  protected onSelect(): void {
    this.selected.emit(this.property().slug);
  }
}