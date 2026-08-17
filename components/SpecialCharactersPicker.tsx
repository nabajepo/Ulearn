"use client";

import {
  useState,
} from "react";

import {
  useLanguage,
} from "@/hooks/useLanguage";

type SpecialCharactersPickerProps = {
  onInsert: (
    value: string
  ) => void;
};

/* =========================================================
   Superscript / subscript maps
   ========================================================= */

const SUPERSCRIPT_MAP:
  Record<string, string> = {
  "0": "⁰",
  "1": "¹",
  "2": "²",
  "3": "³",
  "4": "⁴",
  "5": "⁵",
  "6": "⁶",
  "7": "⁷",
  "8": "⁸",
  "9": "⁹",

  "+": "⁺",
  "-": "⁻",
  "=": "⁼",
  "(": "⁽",
  ")": "⁾",

  n: "ⁿ",
  i: "ⁱ",
};

const SUBSCRIPT_MAP:
  Record<string, string> = {
  "0": "₀",
  "1": "₁",
  "2": "₂",
  "3": "₃",
  "4": "₄",
  "5": "₅",
  "6": "₆",
  "7": "₇",
  "8": "₈",
  "9": "₉",

  "+": "₊",
  "-": "₋",
  "=": "₌",
  "(": "₍",
  ")": "₎",

  a: "ₐ",
  e: "ₑ",
  h: "ₕ",
  i: "ᵢ",
  j: "ⱼ",
  k: "ₖ",
  l: "ₗ",
  m: "ₘ",
  n: "ₙ",
  o: "ₒ",
  p: "ₚ",
  r: "ᵣ",
  s: "ₛ",
  t: "ₜ",
  x: "ₓ",
};

/* =========================================================
   Character groups
   ========================================================= */

const GROUPS = [
  {
    labelKey:
      "specialCharacters.groups.math",

    values: [
      "√",
      "π",
      "∞",
      "≤",
      "≥",
      "≠",
      "±",
      "×",
      "÷",
      "≈",
      "∑",
      "∫",
      "→",
      "←",
    ],
  },

  {
    labelKey:
      "specialCharacters.groups.greek",

    values: [
      "α",
      "β",
      "γ",
      "δ",
      "Δ",
      "θ",
      "λ",
      "μ",
      "π",
      "σ",
      "φ",
      "Ω",
    ],
  },

  {
    labelKey:
      "specialCharacters.groups.science",

    values: [
      "°",
      "℃",
      "℉",
      "µ",
      "Ω",
      "Å",
    ],
  },

  {
    labelKey:
      "specialCharacters.groups.fractions",

    values: [
      "½",
      "⅓",
      "⅔",
      "¼",
      "¾",
      "⅕",
      "⅖",
      "⅗",
      "⅘",
      "⅙",
      "⅚",
      "⅛",
      "⅜",
      "⅝",
      "⅞",
    ],
  },
];

/* =========================================================
   Converter
   ========================================================= */

function convertText(
  value: string,
  map: Record<
    string,
    string
  >
) {
  let result = "";

  for (
    const character of
    value
  ) {
    result +=
      map[character] ??
      character;
  }

  return result;
}

/* =========================================================
   Component
   ========================================================= */

export default function SpecialCharactersPicker({
  onInsert,
}: SpecialCharactersPickerProps) {
  const {
    t,
  } = useLanguage();

  const [
    exponentValue,
    setExponentValue,
  ] =
    useState("");

  const [
    subscriptValue,
    setSubscriptValue,
  ] =
    useState("");

  /* =====================================================
     Insert exponent
     ===================================================== */

  function insertExponent() {
    const value =
      exponentValue.trim();

    if (!value) {
      return;
    }

    const converted =
      convertText(
        value,
        SUPERSCRIPT_MAP
      );

    onInsert(
      converted
    );

    setExponentValue(
      ""
    );
  }

  /* =====================================================
     Insert subscript
     ===================================================== */

  function insertSubscript() {
    const value =
      subscriptValue.trim();

    if (!value) {
      return;
    }

    const converted =
      convertText(
        value,
        SUBSCRIPT_MAP
      );

    onInsert(
      converted
    );

    setSubscriptValue(
      ""
    );
  }

  return (
    <div className="special-characters">
      {/* =================================================
          Standard symbols
          ================================================= */}

      {GROUPS.map(
        (group) => (
          <div
            key={
              group.labelKey
            }
            className="special-characters-group"
          >
            <span
              className="special-characters-label"
            >
              {t(
                group.labelKey
              )}
            </span>

            <div
              className="special-characters-buttons"
            >
              {group.values.map(
                (
                  symbol
                ) => (
                  <button
                    key={`${group.labelKey}-${symbol}`}
                    type="button"
                    className="special-character-button"
                    onClick={() =>
                      onInsert(
                        symbol
                      )
                    }
                  >
                    {symbol}
                  </button>
                )
              )}
            </div>
          </div>
        )
      )}

      {/* =================================================
          Custom exponent
          ================================================= */}

      <div
        className="special-characters-custom"
      >
        <label>
          {t(
            "specialCharacters.exponent.label"
          )}

          <div
            className="special-characters-custom-row"
          >
            <input
              type="text"
              value={
                exponentValue
              }
              maxLength={12}
              placeholder={t(
                "specialCharacters.exponent.placeholder"
              )}
              onChange={(
                event
              ) =>
                setExponentValue(
                  event.target
                    .value
                )
              }
            />

            <button
              type="button"
              className="special-character-insert-button"
              disabled={
                !exponentValue.trim()
              }
              onClick={
                insertExponent
              }
            >
              {t(
                "specialCharacters.insert"
              )}
            </button>
          </div>

          {exponentValue && (
            <small>
              {t(
                "specialCharacters.preview"
              )}
              {" "}
              <strong>
                x
                {convertText(
                  exponentValue,
                  SUPERSCRIPT_MAP
                )}
              </strong>
            </small>
          )}
        </label>
      </div>

      {/* =================================================
          Custom subscript
          ================================================= */}

      <div
        className="special-characters-custom"
      >
        <label>
          {t(
            "specialCharacters.subscript.label"
          )}

          <div
            className="special-characters-custom-row"
          >
            <input
              type="text"
              value={
                subscriptValue
              }
              maxLength={12}
              placeholder={t(
                "specialCharacters.subscript.placeholder"
              )}
              onChange={(
                event
              ) =>
                setSubscriptValue(
                  event.target
                    .value
                )
              }
            />

            <button
              type="button"
              className="special-character-insert-button"
              disabled={
                !subscriptValue.trim()
              }
              onClick={
                insertSubscript
              }
            >
              {t(
                "specialCharacters.insert"
              )}
            </button>
          </div>

          {subscriptValue && (
            <small>
              {t(
                "specialCharacters.preview"
              )}
              {" "}
              <strong>
                x
                {convertText(
                  subscriptValue,
                  SUBSCRIPT_MAP
                )}
              </strong>
            </small>
          )}
        </label>
      </div>

      {/* =================================================
          Advanced formulas
          ================================================= */}

      <div
        className="special-characters-formula-notice"
      >
        <strong>
          ƒx{" "}
          {t(
            "specialCharacters.formula.title"
          )}
        </strong>

        <p>
          {t(
            "specialCharacters.formula.description"
          )}
        </p>
      </div>
    </div>
  );
}