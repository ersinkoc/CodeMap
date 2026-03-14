package main

import (
	"fmt"
	"os"
	"strings"
)

// ProcessArgs processes command-line arguments and returns a formatted string.
func ProcessArgs(args []string) string {
	if len(args) == 0 {
		return ""
	}
	return strings.Join(args, ", ")
}

func main() {
	result := ProcessArgs(os.Args[1:])
	fmt.Println("Arguments:", result)
}
