using UnityEngine;

[CreateAssetMenu(fileName = "Using Acrylic", menuName = "Criteria/Using Acrylic")]
public class UsingAcrylic : UsingMetal
{
	public override bool Assess(PlacementData placementData, out CriteriaFailureData failureData)
	{
		failureData = null;

		bool result = CheckIfCorrectMaterial(placementData.jawType, Jaw_Material.acrylic_jaw);

		if (!result)
			failureData = GenerateFailureData("Not using acrylic material.", actionUponFailure);

		return result;
	}
}
