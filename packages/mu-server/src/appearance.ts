/**
 * Character appearance block used by the character list and the scope packets (18 bytes).
 *
 * The fields follow the reference layout (class, equipment slots 0..11, wing/inventory flags): the
 * values here are a synthetic, licence-free default so the server can produce well-formed packets
 * without shipping game art or client data.
 */
export const DEFAULT_CHARACTER_APPEARANCE = new Uint8Array([
  0x00, // character class (0 = Dark Knight style)
  0x01, // equipment: helm
  0x02, // armour
  0x03, // pants
  0x04, // gloves
  0x05, // boots
  0x00, // weapon right
  0x00, // weapon left
  0x00, // wing
  0x00, // helper/pet
  0x00, // reserved
  0x00, // reserved
  0x00, // reserved
  0x00, // reserved
  0x00, // reserved
  0x00, // reserved
  0x00, // level/excellent flags
  0x00, // reserved
  0x00, // reserved
]);
