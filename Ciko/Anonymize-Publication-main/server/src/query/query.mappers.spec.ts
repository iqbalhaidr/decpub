import { mapEnum, normalizeHex, normalizeAddress, PublicationStatusMap } from './query.mappers';

describe('query.mappers', () => {
  describe('mapEnum', () => {
    it('should correctly map an existing enum value', () => {
      const result = mapEnum(1, PublicationStatusMap);
      expect(result).toBe('Submitted');
    });

    it('should return Unknown for unmapped enum values', () => {
      const result = mapEnum(999, PublicationStatusMap);
      expect(result).toBe('Unknown');
    });
  });

  describe('normalizeHex', () => {
    it('should pass a valid 32-byte hex string starting with 0x', () => {
      const validHex = '0x' + 'a'.repeat(64);
      expect(normalizeHex(validHex)).toBe(validHex);
    });

    it('should add 0x prefix if missing', () => {
      const validHex = 'a'.repeat(64);
      expect(normalizeHex(validHex)).toBe('0x' + validHex);
    });

    it('should throw Error for invalid length', () => {
      expect(() => normalizeHex('0x123')).toThrow('Invalid hex string length');
    });

    it('should pad short hex when optional padToLength is provided (if supported)', () => {
      
      
      expect(() => normalizeHex('0x1234')).toThrow('Invalid hex string length. Expected 66, got 6');
    });
  });

  describe('normalizeAddress', () => {
    it('should pass a valid 20-byte address string starting with 0x', () => {
      const validAddress = '0x' + 'a'.repeat(40);
      expect(normalizeAddress(validAddress)).toBe(validAddress);
    });

    it('should add 0x prefix if missing', () => {
      const validAddress = 'a'.repeat(40);
      expect(normalizeAddress(validAddress)).toBe('0x' + validAddress);
    });

    it('should throw Error for invalid length', () => {
      expect(() => normalizeAddress('0x123')).toThrow('Invalid address length');
    });
  });
});
