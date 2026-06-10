using UnityEngine;

[CreateAssetMenu(fileName = "Tooth Missing", menuName = "Criteria/Tooth Missing")]
public class ToothMissing : ToothPresent
{
	protected override bool CheckToothPresence(int toothIndex)
	{
		return !base.CheckToothPresence(toothIndex);
	}
}
