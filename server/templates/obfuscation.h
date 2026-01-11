#ifndef OBFUSCATION_H
#define OBFUSCATION_H

#include <string>
#include <array>

// Compile-time XOR String Encryption
// Uses C++11/14 features to encrypt string literals at compile time
// and decrypt them at runtime on the stack.

namespace Obfuscation {

    template <int X> struct EnsureCompileTime {
        enum : int { Value = X };
    };

    // Seed generation using TIME macro
    #define SEED ((__TIME__[7] - '0') * 1  + (__TIME__[6] - '0') * 10  + \
                  (__TIME__[4] - '0') * 60 + (__TIME__[3] - '0') * 600 + \
                  (__TIME__[1] - '0') * 3600 + (__TIME__[0] - '0') * 36000)

    constexpr int LinearCongruentialGenerator(int Rounds) {
        return 1013904223 + 1664525 * ((Rounds > 0) ? LinearCongruentialGenerator(Rounds - 1) : SEED & 0xFFFFFFFF);
    }

    #define Random() EnsureCompileTime<LinearCongruentialGenerator(10)>::Value // Simplified random

    constexpr char EncryptCharacter(const char Character, int Index) {
        return Character ^ (char)(Random() + Index);
    }

    template <unsigned N>
    struct XorString {
        char s[N];
        constexpr XorString(const char(&str)[N]) : s{} {
            for (unsigned i = 0; i < N; ++i) s[i] = EncryptCharacter(str[i], i);
        }
        
        // Decrypt at runtime
        std::string decrypt() const {
            std::string dec(N, '\0');
            for (unsigned i = 0; i < N; ++i) {
                dec[i] = s[i] ^ (char)(Random() + i);
            }
            return dec.c_str(); // c_str ensures null termination logic
        }
    };
}

#define _S(str) (Obfuscation::XorString<sizeof(str)>(str).decrypt().c_str())
#define _Ss(str) (Obfuscation::XorString<sizeof(str)>(str).decrypt())

#endif
