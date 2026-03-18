from dataclasses import dataclass


@dataclass
class InstanceName:
    type: str
    prepend: str
    product: str
    number: int

    @classmethod
    def from_parts(cls, type: str, prepend: str, product: str, number: int) -> "InstanceName":
        return cls(type=type, prepend=prepend, product=product, number=number)

    @classmethod
    def parse(cls, name: str) -> "InstanceName":
        """Parse an instance name like 'fs-tve-fwb-001' into its components.

        The convention is: {type}-{prepend}-{product}-{number}
        The number is always the last dash-separated segment (3-digit zero-padded).
        type is always the first segment.
        prepend is the second segment.
        product is everything between prepend and number (may contain dashes).
        """
        parts = name.split("-")
        if len(parts) < 4:
            raise ValueError(
                f"Invalid instance name '{name}'. Expected format: {{type}}-{{prepend}}-{{product}}-{{number}}"
            )
        type_part = parts[0]
        prepend_part = parts[1]
        # Last segment is the number
        number_str = parts[-1]
        try:
            number = int(number_str)
        except ValueError:
            raise ValueError(
                f"Invalid instance name '{name}'. Last segment '{number_str}' must be a number."
            )
        # Everything between prepend and number is the product (may contain dashes)
        product_part = "-".join(parts[2:-1])
        return cls(type=type_part, prepend=prepend_part, product=product_part, number=number)

    def to_string(self) -> str:
        """Return the full instance name e.g. 'fs-tve-fwb-001'."""
        return f"{self.type}-{self.prepend}-{self.product}-{self.number:03d}"

    def golden_image_name(self) -> str:
        """Return the 000 (golden image source) name for this instance."""
        return f"{self.type}-{self.prepend}-{self.product}-000"

    @property
    def base_name(self) -> str:
        """Return the base name without the number e.g. 'fs-tve-fwb'."""
        return f"{self.type}-{self.prepend}-{self.product}"
