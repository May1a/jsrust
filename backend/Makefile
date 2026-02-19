CC ?= clang
CFLAGS ?= -std=c11 -Wall -Wextra -Werror -pedantic -I./src -I./include
LDFLAGS ?=

SRC_COMMON = \
	src/arena.c \
	src/backend_api.c \
	src/bytes.c \
	src/cli.c \
	src/errors.c \
	src/exec_core.c \
	src/fs.c \
	src/ir_binary.c \
	src/ir_model.c \
	src/ir_validate_min.c \
	src/log.c \
	src/runtime.c \
	src/trace.c

SRC_MAIN = src/main.c
OBJ_COMMON = $(SRC_COMMON:.c=.o)
OBJ_MAIN = $(SRC_MAIN:.c=.o)

BIN_DIR = bin
BIN = $(BIN_DIR)/jsrust-backend-c
TEST_BIN = $(BIN_DIR)/backend-tests

.PHONY: all build test clean policy

all: build

build: $(BIN)

$(BIN): $(OBJ_COMMON) $(OBJ_MAIN)
	@mkdir -p $(BIN_DIR)
	$(CC) $(CFLAGS) $(OBJ_COMMON) $(OBJ_MAIN) -o $(BIN) $(LDFLAGS)

$(TEST_BIN): $(OBJ_COMMON) tests/backend_tests.o
	@mkdir -p $(BIN_DIR)
	$(CC) $(CFLAGS) $(OBJ_COMMON) tests/backend_tests.o -o $(TEST_BIN) $(LDFLAGS)

src/%.o: src/%.c
	$(CC) $(CFLAGS) -c $< -o $@

tests/%.o: tests/%.c
	$(CC) $(CFLAGS) -c $< -o $@

test: $(TEST_BIN)
	./$(TEST_BIN)

policy:
	./tools/check_policy.sh

clean:
	rm -f src/*.o tests/*.o
	rm -rf $(BIN_DIR)
	rm -f tests/tmp_bad_magic.bin tests/tmp_bad_version.bin tests/tmp_truncated.bin tests/tmp_bad_call.bin tests/tmp_trace_one.txt tests/tmp_trace_two.txt tests/tmp_trace_cli.txt
