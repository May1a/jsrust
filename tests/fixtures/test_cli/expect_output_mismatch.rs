#[expect_output("different line\n")]
#[test]
fn test_print_mismatch() {
    println!("actual line");
}
