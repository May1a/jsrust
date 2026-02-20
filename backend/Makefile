CC ?= clang
WASM_CC ?= clang
CFLAGS ?= -std=c11 -O3 -Wall -Wextra -Werror -pedantic -I./src -I./include
LDFLAGS ?=
WASM_CFLAGS ?= -std=c11 -Wall -Wextra -Werror -pedantic -I./src -I./include -DJSRUST_BACKEND_WASM=1
WASM_LDFLAGS ?= \
	--target=wasm32-unknown-unknown \
	-nostdlib \
	-Wl,--no-entry \
	-Wl,--export-memory \
	-Wl,--initial-memory=4194304 \
	-Wl,--max-memory=67108864 \
	-Wl,--export=jsrust_wasm_alloc \
	-Wl,--export=jsrust_wasm_reset \
	-Wl,--export=jsrust_wasm_run \
	-Wl,--export=jsrust_wasm_codegen \
	-Wl,--export=jsrust_wasm_result_code \
	-Wl,--export=jsrust_wasm_result_has_exit_value \
	-Wl,--export=jsrust_wasm_result_exit_value \
	-Wl,--export=jsrust_wasm_result_message_ptr \
	-Wl,--export=jsrust_wasm_result_message_len \
	-Wl,--export=jsrust_wasm_stdout_ptr \
	-Wl,--export=jsrust_wasm_stdout_len \
	-Wl,--export=jsrust_wasm_trace_ptr \
	-Wl,--export=jsrust_wasm_trace_len \
	-Wl,--export=jsrust_wasm_codegen_wasm_ptr \
	-Wl,--export=jsrust_wasm_codegen_wasm_len

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
	src/trace.c \
	src/wasm_emit.c \
	src/wasm_encode.c

SRC_MAIN = src/main.c
SRC_WASM = \
	src/arena.c \
	src/backend_api.c \
	src/backend_wasm_api.c \
	src/bytes.c \
	src/errors.c \
	src/exec_core.c \
	src/ir_binary.c \
	src/ir_model.c \
	src/ir_validate_min.c \
	src/runtime.c \
	src/trace.c \
	src/wasm_emit.c \
	src/wasm_encode.c \
	src/wasm_alloc.c
OBJ_COMMON = $(SRC_COMMON:.c=.o)
OBJ_MAIN = $(SRC_MAIN:.c=.o)

BIN_DIR = bin
BIN = $(BIN_DIR)/jsrust-backend-c
TEST_BIN = $(BIN_DIR)/backend-tests
WASM_BIN = $(BIN_DIR)/jsrust-backend.wasm

.PHONY: all build wasm test clean policy

all: build

build: $(BIN)

wasm: $(WASM_BIN)

$(BIN): $(OBJ_COMMON) $(OBJ_MAIN)
	@mkdir -p $(BIN_DIR)
	$(CC) $(CFLAGS) $(OBJ_COMMON) $(OBJ_MAIN) -o $(BIN) $(LDFLAGS)

$(TEST_BIN): $(OBJ_COMMON) tests/backend_tests.o
	@mkdir -p $(BIN_DIR)
	$(CC) $(CFLAGS) $(OBJ_COMMON) tests/backend_tests.o -o $(TEST_BIN) $(LDFLAGS)

$(WASM_BIN): $(SRC_WASM)
	@mkdir -p $(BIN_DIR)
	$(WASM_CC) $(WASM_CFLAGS) $(SRC_WASM) -o $(WASM_BIN) $(WASM_LDFLAGS)

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
